import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { attachPatientNames } from '@/lib/api/clinical-list';

// GET /api/clinico/anamneses - todas as anamneses da clínica (para a página /clinico/anamneses).
export async function GET() {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'view');
    if (error) return error;
    const rows = await prisma.patientAnamnesis.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return NextResponse.json(await attachPatientNames(rows, dbUser!.companyId));
  } catch (err) {
    console.error('Erro ao listar anamneses (clínica):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
