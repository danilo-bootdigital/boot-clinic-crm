import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { downloadWhatsappMediaBytes } from '@/lib/storage/messaging-storage';

export const runtime = 'nodejs';

// GET /api/mensageria/quick-replies/[id]/attachment — bytes do anexo.
//
// Usado pelo composer ao escolher "/palavra": baixa o anexo já salvo e monta
// um File no navegador para reaproveitar o MESMO fluxo de envio de mídia da
// conversa (handleSendMedia) — sem isso o disparo teria que duplicar toda a
// lógica de upload → Message → MessageAttachment → Evolution.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const item = await prisma.quickReply.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { attachmentPath: true, attachmentMimeType: true, attachmentFileName: true },
    });
    if (!item?.attachmentPath) return NextResponse.json({ error: 'Sem anexo' }, { status: 404 });

    const bytes = await downloadWhatsappMediaBytes(item.attachmentPath, dbUser!.companyId);
    if (!bytes) return NextResponse.json({ error: 'Anexo indisponível' }, { status: 404 });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': item.attachmentMimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${(item.attachmentFileName || 'arquivo').replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('Erro ao baixar anexo de mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
