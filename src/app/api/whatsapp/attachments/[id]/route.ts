import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { createWhatsappMediaSignedUrl } from '@/lib/storage/whatsapp-storage';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

export const runtime = 'nodejs';

// GET /api/whatsapp/attachments/[id]
// Devolve uma signed URL de CURTA duração para o anexo — só se pertence à empresa
// da sessão e não está soft-deletado. Nunca devolve o storagePath cru.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    // companyId da sessão no filtro → clínica A nunca acessa anexo da clínica B.
    const att = await prisma.whatsAppAttachment.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!att) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    const url = await createWhatsappMediaSignedUrl(att.storagePath, dbUser!.companyId);
    if (!url) return NextResponse.json({ error: 'Mídia indisponível' }, { status: 409 });

    // Auditoria de download (sem storagePath/URL/segredo).
    await writeAudit({
      dbUser: dbUser!, action: ActionType.DOWNLOAD_ATTACHMENT, entityType: EntityType.WHATSAPP_CONVERSATION,
      entityId: att.messageId, newValues: { attachmentId: att.id, mimeType: att.mimeType }, request,
    });

    return NextResponse.json({
      url, // signed URL efêmera (não persistir)
      mimeType: att.mimeType,
      originalFileName: att.originalFileName,
      sizeBytes: att.sizeBytes,
    });
  } catch (err) {
    console.error('Erro ao gerar acesso ao anexo WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
