import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendMediaForConversation, sendAudioForConversation } from '@/lib/whatsapp/evolution';
import { uploadWhatsappMedia, deleteWhatsappMedia } from '@/lib/storage/whatsapp-storage';
import { categoryForMime, validateWhatsappMedia } from '@/lib/whatsapp/media-config';
import { mediaPlaceholder } from '@/lib/whatsapp/ingest';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

export const runtime = 'nodejs';

function serialize(m: any, att: any) {
  return {
    id: m.id, conversationId: m.conversationId, content: m.content, caption: m.caption ?? null,
    messageType: m.messageType, direction: m.direction, isFromPatient: m.direction === 'INCOMING',
    status: m.status, mediaStatus: m.mediaStatus, sentAt: m.sentAt ?? null, createdAt: m.createdAt,
    attachment: att ? { id: att.id, mimeType: att.mimeType, sizeBytes: att.sizeBytes, originalFileName: att.originalFileName } : null,
  };
}

// POST /api/whatsapp/messages/media  (multipart/form-data: file, conversationId, caption?)
// Fluxo transacional: cria msg PENDING → upload storage → cria attachment → envia
// Evolution → atualiza status. Compensações explícitas evitam arquivo/registro órfão.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    const conversationId = String(form?.get('conversationId') || '');
    const caption = (form?.get('caption') ? String(form?.get('caption')) : '').trim() || null;
    if (!(file instanceof File) || !conversationId) {
      return NextResponse.json({ error: 'Arquivo e conversa são obrigatórios' }, { status: 400 });
    }

    // companyId SEMPRE da sessão; conversa tem que ser da empresa.
    const conv = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const declaredMime = file.type || 'application/octet-stream';
    const category = categoryForMime(declaredMime);
    if (!category) return NextResponse.json({ error: `Tipo não suportado: ${declaredMime}`, field: 'file' }, { status: 400 });

    // Validação forte (MIME/extensão/tamanho/traversal/magic-bytes). Não confia no browser.
    const v = validateWhatsappMedia({ declaredMime, fileName: file.name, sizeBytes: bytes.length, bytes });
    if (!v.ok) return NextResponse.json({ error: v.error, field: 'file' }, { status: 400 });

    const messageType = category === 'image' ? 'IMAGE' : category === 'audio' ? 'AUDIO' : 'DOCUMENT';
    const content = caption ?? mediaPlaceholder(messageType as any);

    // 1) Mensagem PENDING (âncora do fluxo).
    const msg = await prisma.whatsAppMessage.create({
      data: {
        companyId: dbUser!.companyId, conversationId: conv.id, instanceId: conv.instanceId,
        source: 'CRM', content, caption, messageType, direction: 'OUTGOING',
        status: 'PENDING', mediaStatus: 'PENDING', createdByUserId: dbUser!.id,
      },
    });

    // 2) Upload no storage privado. Falha → msg FAILED (sem anexo órfão).
    let up;
    try {
      up = await uploadWhatsappMedia({
        companyId: dbUser!.companyId, conversationId: conv.id, messageId: msg.id,
        fileName: file.name, contentType: declaredMime, bytes,
      });
    } catch (e) {
      await prisma.whatsAppMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', mediaStatus: 'FAILED', failedAt: new Date(), errorMessage: 'falha no upload' } });
      await writeAudit({ dbUser: dbUser!, action: ActionType.UPLOAD_ATTACHMENT, entityType: EntityType.WHATSAPP_CONVERSATION, entityId: conv.id, newValues: { messageId: msg.id, result: 'upload_failed' }, request });
      return NextResponse.json({ error: 'Falha ao armazenar o arquivo' }, { status: 502 });
    }

    // 3) Attachment. Falha → COMPENSA removendo o arquivo (evita órfão) + msg FAILED.
    let att;
    try {
      att = await prisma.whatsAppAttachment.create({
        data: {
          companyId: dbUser!.companyId, // derivado da sessão/mensagem, nunca do cliente
          messageId: msg.id, storagePath: up.path, mimeType: up.mimeType,
          sizeBytes: up.sizeBytes, checksum: up.checksum ?? null, originalFileName: up.originalFileName,
        },
      });
    } catch (e) {
      await deleteWhatsappMedia(up.path, dbUser!.companyId); // compensação: sem arquivo órfão
      await prisma.whatsAppMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', mediaStatus: 'FAILED', failedAt: new Date(), errorMessage: 'falha ao registrar anexo' } });
      return NextResponse.json({ error: 'Falha ao registrar o anexo' }, { status: 500 });
    }

    // Arquivo + registro OK → mídia disponível localmente (independe do envio).
    await prisma.whatsAppMessage.update({ where: { id: msg.id }, data: { mediaStatus: 'AVAILABLE' } });

    // 4) Envio pela Evolution. Falha NÃO apaga nada → permite reenvio (retry).
    // Áudio vai como NOTA DE VOZ (sendWhatsAppAudio); imagem/documento via sendMedia.
    const base64 = Buffer.from(bytes).toString('base64');
    const convRef = { companyId: dbUser!.companyId, instanceId: conv.instanceId };
    const sent = category === 'audio'
      ? await sendAudioForConversation(convRef, conv.contactPhone, base64)
      : await sendMediaForConversation(convRef, conv.contactPhone, { mediatype: category === 'image' ? 'image' : 'document', mimetype: up.mimeType, base64, fileName: up.originalFileName, caption: caption ?? undefined });
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';
    const usedInstanceId = sent.instanceId ?? conv.instanceId ?? null;

    const finalMsg = await prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status, instanceId: usedInstanceId, externalId: sent.messageId ?? null,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
        errorMessage: status === 'FAILED' ? 'falha no envio pela Evolution' : null,
      },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { lastMessage: content, lastMessageAt: new Date(), instanceId: conv.instanceId ?? usedInstanceId ?? undefined },
    });

    await writeAudit({
      dbUser: dbUser!, action: ActionType.UPLOAD_ATTACHMENT, entityType: EntityType.WHATSAPP_CONVERSATION,
      entityId: conv.id, newValues: { messageId: msg.id, messageType, status }, request,
    });

    return NextResponse.json(serialize(finalMsg, att), { status: 201 });
  } catch (err) {
    console.error('Erro ao enviar mídia WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
