import { Channel } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendMediaForConversation, sendAudioForConversation, sendWhatsappForConversation } from '@/lib/messaging/adapters/whatsapp/evolution';
import { downloadWhatsappMediaBytes } from '@/lib/storage/messaging-storage';
import { categoryForMime } from '@/lib/messaging/media-config';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

export const runtime = 'nodejs';

// POST /api/mensageria/messages/[id]/retry
// Reenvia uma mensagem de saída que não saiu — TEXTO (reaproveita o conteúdo) ou
// MÍDIA (reaproveita o anexo já armazenado, sem novo upload).
// Idempotente: se já houver externalId (já foi enviada mas o registro local
// falhou), apenas marca SENT — não reenvia (evita duplicar no paciente).
//
// Aceita FAILED e também PENDING sem externalId: essa combinação significa que o
// provedor nunca aceitou a mensagem, então ela está parada em "enviando…" e o
// atendente precisa de uma saída.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const msg = await prisma.message.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, direction: 'OUTGOING' },
      include: { attachments: { where: { deletedAt: null } } },
    });
    if (!msg) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    const reenviavel = msg.status === 'FAILED' || (msg.status === 'PENDING' && !msg.externalId);
    if (!reenviavel) {
      return NextResponse.json({ error: 'Só é possível reenviar mensagens que não saíram' }, { status: 409 });
    }

    // Idempotência: já enviada antes → apenas reconcilia o status local.
    if (msg.externalId) {
      const fixed = await prisma.message.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: msg.sentAt ?? new Date(), failedAt: null, errorMessage: null } });
      return NextResponse.json({ id: fixed.id, status: fixed.status, reconciled: true });
    }

    const att = msg.attachments[0];
    const isMedia = msg.messageType !== 'TEXT' && msg.messageType !== null;
    if (isMedia && (!att || msg.mediaStatus !== 'AVAILABLE')) {
      return NextResponse.json({ error: 'Mídia indisponível para reenvio' }, { status: 409 });
    }

    const conv = await prisma.conversation.findFirst({
      where: { id: msg.conversationId, companyId: dbUser!.companyId, deletedAt: null },
      include: { contact: { select: { phone: true } } },
    });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    if (conv.channel !== Channel.WHATSAPP) {
      return NextResponse.json({ error: `Reenvio não suportado no canal ${conv.channel}` }, { status: 501 });
    }
    const contactPhone = conv.contact.phone;
    if (!contactPhone) {
      return NextResponse.json({ error: 'Contato sem telefone para reenvio' }, { status: 400 });
    }

    const convRef = { companyId: dbUser!.companyId, instanceId: msg.accountId ?? conv.accountId };

    let sent;
    if (!isMedia) {
      // Texto: o conteúdo já está na mensagem — reenvia o mesmo texto.
      sent = await sendWhatsappForConversation(convRef, contactPhone, msg.content);
    } else {
      const bytes = await downloadWhatsappMediaBytes(att!.storagePath, dbUser!.companyId);
      if (!bytes) return NextResponse.json({ error: 'Não foi possível ler a mídia armazenada' }, { status: 409 });
      const category = categoryForMime(att!.mimeType);
      const base64 = Buffer.from(bytes).toString('base64');
      sent = category === 'audio'
        ? await sendAudioForConversation(convRef, contactPhone, base64)
        : await sendMediaForConversation(convRef, contactPhone, { mediatype: category === 'image' ? 'image' : 'document', mimetype: att!.mimeType, base64, fileName: att!.originalFileName || 'arquivo', caption: msg.caption ?? undefined });
    }
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';

    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: {
        status, externalId: sent.messageId ?? null, accountId: sent.instanceId ?? msg.accountId,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
        errorMessage: status === 'FAILED' ? sent.error ?? 'falha no reenvio pela Evolution' : null,
      },
    });

    await writeAudit({ dbUser: dbUser!, action: ActionType.UPLOAD_ATTACHMENT, entityType: EntityType.WHATSAPP_CONVERSATION, entityId: conv.id, oldValues: { status: 'FAILED' }, newValues: { messageId: msg.id, status }, request });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error('Erro ao reenviar mídia WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
