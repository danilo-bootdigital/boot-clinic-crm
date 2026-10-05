import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { buildContractVariables } from '@/lib/contracts/variables';

// GET /api/patients/[id]/contracts/context?procedure=&value=&professional=
// Variáveis do contrato a partir do CADASTRO completo do paciente e da clínica.
// A tela usa para pré-visualizar o modelo já preenchido e avisar o que falta
// no cadastro antes de o contrato sair com lacunas.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'contratos', 'view');
    if (error) return error;
    const [full, company] = await Promise.all([
      prisma.patient.findFirst({ where: { id: patient!.id, companyId: dbUser!.companyId } }),
      prisma.company.findUnique({
        where: { id: dbUser!.companyId },
        select: { name: true, cnpj: true, address: true, phone: true, email: true },
      }),
    ]);
    if (!full || !company) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    const q = request.nextUrl.searchParams;
    const value = q.get('value') ? Number(q.get('value')) : null;
    const variables = buildContractVariables(full, company, {
      procedure: q.get('procedure'),
      value: Number.isFinite(value) ? value : null,
      professional: q.get('professional'),
    });
    return NextResponse.json({ variables });
  } catch (err) {
    console.error('Erro ao montar dados do contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
