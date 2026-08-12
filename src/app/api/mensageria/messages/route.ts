import { Channel, MessageSource } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendWhatsappForConversation } from '@/lib/messaging/adapters/whatsapp/evolution';

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
    readAt: m.readAt ?? null, createdAt: m.createdAt,
    // Nunca expõe storagePath — só metadados + o id p/ buscar a signed URL sob demanda.
    attachment: att ? { id: att.id, mimeType: att.mimeType, sizeBytes: att.sizeBytes, originalFileName: att.originalFileName } : null,
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
    // Envio só existe para canal com adapter de saída. WhatsApp é o único hoje.
    if (conv.channel !== Channel.WHATSAPP) {
      return NextResponse.json(
        { error: `Envio ainda não suportado no canal ${conv.channel}` },
        { status: 501 }
      );
    }
    if (!conv.contact.phone) {
      return NextResponse.json({ error: 'Contato sem telefone para envio' }, { status: 400 });
    }

    const sent = await sendWhatsappForConversation({ companyId: dbUser!.companyId, instanceId: conv.accountId }, conv.contact.phone, d.content);
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';
    const usedInstanceId = sent.instanceId ?? conv.accountId ?? null;

    const msg = await prisma.message.create({
      // externalId = id retornado pela Evolution → o eco fromMe no MESSAGES_UPSERT casa
      // por essa chave e NÃO é gravado de novo. source=CRM distingue do envio pelo celular.
      data: {
        companyId: dbUser!.companyId, conversationId: conv.id,
        // Etiqueta de procedência (§4.3): saiu pela tela, por esta conta.
        channel: conv.channel, accountId: usedInstanceId, source: MessageSource.CRM,
        externalId: sent.messageId ?? null, content: d.content,
        messageType: 'TEXT', direction: 'OUTGOING', status,
        createdByUserId: dbUser!.id,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
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
