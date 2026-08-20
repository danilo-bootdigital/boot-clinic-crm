import { Channel, MessageSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendWhatsappForConversation } from '@/lib/messaging/adapters/whatsapp/evolution';
import { sendInstagramText, replyWindow } from '@/lib/messaging/adapters/instagram/graph';

const CreateSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1, 'Mensagem vazia'),
  type: z.string().optional(),
});

function serialize(m: any) {
  const att = m.attachments?.find((a: any) => !a.deletedAt) ?? null;
  return {
    id: m.id, conversationId: m.conversationId, content: m.content,
    // Etiqueta de procedência (§4.3): vem da PRÓPRIA mensagem. A tela não deduz
    // canal a partir da conversa — numa thread com identidades em dois canais
    // as mensagens divergem entre si.
    channel: m.channel, accountLabel: m.account?.label ?? null, source: m.source,
    entryPoint: m.entryPoint ?? null,
    messageType: m.messageType ?? 'TEXT', caption: m.caption ?? null,
    mediaStatus: m.mediaStatus ?? null,
    direction: m.direction, isFromPatient: m.direction === 'INCOMING',
    status: m.status, sentAt: m.sentAt ?? null, deliveredAt: m.deliveredAt ?? null,
    // Motivo da falha (já sanitizado na origem) — a bolha precisa dizer o porquê.
    errorMessage: m.errorMessage ?? null,
    readAt: m.readAt ?? null, createdAt: m.createdAt,
    // Nunca expõe storagePath — só metadados + o id p/ buscar a signed URL sob demanda.
    // `durationSeconds` vem do provedor e é a duração AUTORITATIVA do áudio: o
    // container de nota de voz não traz duração confiável, e sem este campo o
    // player depende do palpite do navegador (que erra e corta a reprodução).
    attachment: att
      ? {
          id: att.id, mimeType: att.mimeType, sizeBytes: att.sizeBytes,
          originalFileName: att.originalFileName, durationSeconds: att.durationSeconds ?? null,
        }
      : null,
  };
}

// GET /api/mensageria/messages?conversationId=
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json([]);

    // Garante que a conversa é da empresa.
    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, companyId: dbUser!.companyId } });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    // Marca como lida.
    if (conv.unreadCount > 0) await prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });

    const msgs = await prisma.message.findMany({
      where: { conversationId, companyId: dbUser!.companyId },
      include: {
        attachments: { where: { deletedAt: null } },
        account: { select: { label: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(msgs.map(serialize));
  } catch (err) {
    console.error('Erro ao listar mensagens:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Janela de idempotência do envio de texto (ms). Duas requisições com o MESMO
// conteúdo na MESMA conversa dentro dela são o mesmo envio — não uma repetição
// deliberada. Existe porque o clique/Enter repetido enquanto o provedor responde
// (1-2s) fazia o paciente receber a mensagem 2-5x. A trava é aqui, no servidor,
// porque a do cliente não protege contra duas abas, reenvio do navegador ou retry.
const SEND_DEDUP_WINDOW_MS = 10_000;

// POST /api/mensageria/messages - envia (via Evolution se configurada) ou grava como pendente.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());
    const conv = await prisma.conversation.findFirst({
      where: { id: d.conversationId, companyId: dbUser!.companyId, deletedAt: null },
      include: { contact: { select: { phone: true } } },
    });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    // Despacho por canal: cada adapter tem suas regras de saída.
    if (conv.channel === Channel.TIKTOK) {
      return NextResponse.json(
        { error: 'Envio não suportado no canal TIKTOK (sem API pública de DM)' },
        { status: 501 }
      );
    }

    // Idempotência (1/2): envio idêntico recente → devolve o que já existe, sem
    // chamar o provedor de novo. Não considera FAILED: depois de uma falha, repetir
    // o mesmo texto é reenvio legítimo e precisa passar.
    const recentTwin = await prisma.message.findFirst({
      where: {
        companyId: dbUser!.companyId, conversationId: conv.id,
        direction: 'OUTGOING', source: MessageSource.CRM,
        content: d.content,
        status: { in: ['PENDING', 'SENT', 'DELIVERED', 'READ'] },
        createdAt: { gte: new Date(Date.now() - SEND_DEDUP_WINDOW_MS) },
      },
      include: { attachments: { where: { deletedAt: null } }, account: { select: { label: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (recentTwin) {
      return NextResponse.json({ ...serialize(recentTwin), deduplicated: true });
    }

    // Destino resolvido ANTES de gravar qualquer coisa: erro de configuração
    // (sem conta, sem identidade, sem telefone) não deixa mensagem pendurada.
    let igAccount: Awaited<ReturnType<typeof prisma.channelAccount.findFirst>> = null;
    let igRecipient: string | null = null;

    if (conv.channel === Channel.INSTAGRAM) {
      // Janela de 24h da Meta: recusamos ANTES de chamar a API, para o atendente
      // ver o motivo em vez de um erro opaco do provedor.
      const window = await replyWindow(conv.id);
      if (!window.open) {
        return NextResponse.json(
          {
            error: window.lastInboundAt
              ? 'Janela de 24h encerrada: o Instagram só permite responder até 24h após a última mensagem da pessoa.'
              : 'Só é possível responder no Instagram depois que a pessoa enviar uma mensagem.',
            replyWindow: { open: false, lastInboundAt: window.lastInboundAt, closesAt: window.closesAt },
          },
          { status: 409 }
        );
      }

      igAccount = conv.accountId
        ? await prisma.channelAccount.findFirst({ where: { id: conv.accountId, companyId: dbUser!.companyId } })
        : null;
      if (!igAccount) {
        return NextResponse.json({ error: 'Conta do Instagram não encontrada para esta conversa' }, { status: 409 });
      }

      // No Instagram a identidade é o IGSID, não o telefone.
      const identity = await prisma.contactIdentity.findFirst({
        where: { companyId: dbUser!.companyId, contactId: conv.contactId, channel: Channel.INSTAGRAM },
        select: { externalId: true },
      });
      if (!identity) {
        return NextResponse.json({ error: 'Contato sem identidade no Instagram' }, { status: 400 });
      }
      igRecipient = identity.externalId;
    } else if (!conv.contact.phone) {
      return NextResponse.json({ error: 'Contato sem telefone para envio' }, { status: 400 });
    }

    // Idempotência (2/2): a âncora é gravada ANTES de falar com o provedor. Assim
    // uma segunda requisição simultânea encontra a gêmea na checagem acima em vez
    // de disparar um segundo envio — a janela perigosa é justamente o tempo de
    // resposta do provedor. O status real é carimbado depois.
    const anchor = await prisma.message.create({
      data: {
        companyId: dbUser!.companyId, conversationId: conv.id,
        // Etiqueta de procedência (§4.3): saiu pela tela, por esta conta.
        channel: conv.channel, accountId: igAccount?.id ?? conv.accountId, source: MessageSource.CRM,
        content: d.content, messageType: 'TEXT', direction: 'OUTGOING', status: 'PENDING',
        createdByUserId: dbUser!.id,
      },
    });

    let sent: { configured: boolean; ok: boolean; messageId?: string | null; instanceId?: string | null; error?: string };

    if (conv.channel === Channel.INSTAGRAM) {
      const res = await sendInstagramText(igAccount!, igRecipient!, d.content);
      sent = { configured: res.configured, ok: res.ok, messageId: res.messageId ?? null, instanceId: igAccount!.id, error: res.error };
    } else {
      sent = await sendWhatsappForConversation({ companyId: dbUser!.companyId, instanceId: conv.accountId }, conv.contact.phone!, d.content);
    }
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';
    const usedInstanceId = sent.instanceId ?? conv.accountId ?? null;

    const msg = await prisma.message.update({
      where: { id: anchor.id },
      // externalId = id retornado pela Evolution → o eco fromMe no MESSAGES_UPSERT casa
      // por essa chave e NÃO é gravado de novo. source=CRM distingue do envio pelo celular.
      data: {
        accountId: usedInstanceId, externalId: sent.messageId ?? null, status,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
        // Sem isto a bolha só dizia "falhou", sem o porquê — e "número
        // desconectado" é acionável pelo atendente, HTTP 500 não é.
        errorMessage: status === 'FAILED' ? sent.error ?? 'falha no envio pela Evolution' : null,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      // Vincula a conversa à instância usada na 1ª saída (não sobrescreve se já houver).
      data: { lastMessage: d.content, lastMessageAt: new Date(), accountId: conv.accountId ?? usedInstanceId ?? undefined },
    });
    return NextResponse.json(serialize(msg), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao enviar mensagem:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
