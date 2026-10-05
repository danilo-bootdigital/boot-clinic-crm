import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { clinicalSignedUrl } from '@/lib/storage/clinical-storage';

// GET /api/clinico/contracts/[id]/pdf — baixa o PDF assinado (URL temporária).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'view');
    if (error) return error;
    const c = await prisma.patientContract.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true, signedPdfPath: true },
    });
    if (!c?.signedPdfPath) return NextResponse.json({ error: 'PDF assinado não encontrado' }, { status: 404 });
    const url = await clinicalSignedUrl(c.signedPdfPath, 300);
    if (!url) return NextResponse.json({ error: 'Armazenamento indisponível' }, { status: 503 });
    await writeAudit({ dbUser: dbUser!, action: 'DOWNLOAD_ATTACHMENT', entityType: 'CONTRACT', entityId: c.id, request });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('Erro ao baixar contrato assinado:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
