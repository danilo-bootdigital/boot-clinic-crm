import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { attachPatientNames } from '@/lib/api/clinical-list';
import { clinicalSignedUrl } from '@/lib/storage/clinical-storage';

// GET /api/clinico/images - imagens da clínica (página /clinico/imagens) com URL assinada.
export async function GET() {
  try {
    const { dbUser, error } = await resolveClinicalUser('imagens', 'view');
    if (error) return error;
    const rows = await prisma.patientImage.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const withNames = await attachPatientNames(rows, dbUser!.companyId);
    const data = await Promise.all(withNames.map(async (img) => ({
      id: img.id, patientId: img.patientId, patientName: img.patientName,
      category: img.category, description: img.description, createdAt: img.createdAt,
      url: await clinicalSignedUrl(img.url),
    })));
    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro ao listar imagens (clínica):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
