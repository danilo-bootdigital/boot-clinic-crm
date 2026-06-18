import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { attachPatientNames } from '@/lib/api/clinical-list';
import { clinicalSignedUrl } from '@/lib/storage/clinical-storage';

// GET /api/clinico/documents - documentos da clínica (página /clinico/imagens, aba Documentos).
export async function GET() {
  try {
    const { dbUser, error } = await resolveClinicalUser('imagens', 'view');
    if (error) return error;
    const rows = await prisma.patientDocument.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const withNames = await attachPatientNames(rows, dbUser!.companyId);
    const data = await Promise.all(withNames.map(async (doc) => ({
      id: doc.id, patientId: doc.patientId, patientName: doc.patientName,
      title: doc.title, category: doc.category, originalName: doc.originalName, createdAt: doc.createdAt,
      url: await clinicalSignedUrl(doc.url),
    })));
    return NextResponse.json(data);
  } catch (err) {
    console.error('Erro ao listar documentos (clínica):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
