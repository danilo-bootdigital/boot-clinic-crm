import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendMediaForConversation } from '@/lib/whatsapp/evolution';
import { downloadWhatsappMediaBytes } from '@/lib/storage/whatsapp-storage';
import { categoryForMime } from '@/lib/whatsapp/media-config';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

export const runtime = 'nodejs';

// POST /api/whatsapp/messages/[id]/retry
// Reenvia uma mensagem de MÍDIA FALHA reutilizando o anexo já armazenado (sem novo
// upload). Idempotente: se já houver externalId (já foi enviada mas o registro local
// falhou), apenas marca SENT — não reenvia (evita mídia duplicada ao paciente).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const msg = await prisma.whatsAppMessage.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, direction: 'OUTGOING' },
      include: { attachments: { where: { deletedAt: null } } },
    });
    if (!msg) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });
    if (msg.status !== 'FAILED') return NextResponse.json({ error: 'Só é possível reenviar mensagens com falha' }, { status: 409 });

    const att = msg.attachments[0];
    if (!att || msg.mediaStatus !== 'AVAILABLE') {
      return NextResponse.json({ error: 'Mídia indisponível para reenvio' }, { status: 409 });
    }

    // Idempotência: já enviada antes → apenas reconcilia o status local.
    if (msg.externalId) {
      const fixed = await prisma.whatsAppMessage.update({ where: { id: msg.id }, data: { status: 'SENT', sentAt: msg.sentAt ?? new Date(), failedAt: null, errorMessage: null } });
      return NextResponse.json({ id: fixed.id, status: fixed.status, reconciled: true });
    }

    const conv = await prisma.whatsAppConversation.findFirst({ where: { id: msg.conversationId, companyId: dbUser!.companyId, deletedAt: null } });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const bytes = await downloadWhatsappMediaBytes(att.storagePath, dbUser!.companyId);
    if (!bytes) return NextResponse.json({ error: 'Não foi possível ler a mídia armazenada' }, { status: 409 });

    const category = categoryForMime(att.mimeType);
    const sent = await sendMediaForConversation(
      { companyId: dbUser!.companyId, instanceId: msg.instanceId ?? conv.instanceId },
      conv.contactPhone,
      { mediatype: category === 'image' ? 'image' : 'document', mimetype: att.mimeType, base64: Buffer.from(bytes).toString('base64'), fileName: att.originalFileName || 'arquivo', caption: msg.caption ?? undefined },
    );
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';

    const updated = await prisma.whatsAppMessage.update({
      where: { id: msg.id },
      data: {
        status, externalId: sent.messageId ?? null, instanceId: sent.instanceId ?? msg.instanceId,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
        errorMessage: status === 'FAILED' ? 'falha no reenvio pela Evolution' : null,
      },
    });

    await writeAudit({ dbUser: dbUser!, action: ActionType.UPLOAD_ATTACHMENT, entityType: EntityType.WHATSAPP_CONVERSATION, entityId: conv.id, oldValues: { status: 'FAILED' }, newValues: { messageId: msg.id, status }, request });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error('Erro ao reenviar mídia WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
