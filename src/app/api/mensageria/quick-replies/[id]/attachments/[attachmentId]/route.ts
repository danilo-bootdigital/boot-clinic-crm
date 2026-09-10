import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { downloadWhatsappMediaBytes } from '@/lib/storage/messaging-storage';

export const runtime = 'nodejs';

// GET /api/mensageria/quick-replies/[id]/attachments/[attachmentId] — bytes de UM anexo.
//
// Usado pelo composer ao escolher "/palavra": baixa cada anexo já salvo e
// monta um File no navegador por imagem, todos entrando na MESMA fila de
// envio do composer (com a legenda própria de cada um) — sem isso o disparo
// teria que duplicar toda a lógica de upload → Message → MessageAttachment →
// Evolution para cada imagem.
export async function GET(_request: NextRequest, { params }: { params: { id: string; attachmentId: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const attachment = await prisma.quickReplyAttachment.findFirst({
      where: { id: params.attachmentId, quickReplyId: params.id, companyId: dbUser!.companyId },
    });
    if (!attachment) return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 });

    const bytes = await downloadWhatsappMediaBytes(attachment.path, dbUser!.companyId);
    if (!bytes) return NextResponse.json({ error: 'Anexo indisponível' }, { status: 404 });

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `inline; filename="${attachment.fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('Erro ao baixar anexo de mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
