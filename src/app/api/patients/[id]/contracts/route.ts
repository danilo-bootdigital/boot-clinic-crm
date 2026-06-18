import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { CreatePatientContractSchema } from '@/lib/validations/clinical';

// GET /api/patients/[id]/contracts - contratos do paciente.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'contratos', 'view');
    if (error) return error;
    const rows = await prisma.patientContract.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar contratos:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/contracts - gera um contrato (conteúdo já resolvido no cliente ou aqui).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'contratos', 'edit');
    if (error) return error;
    const d = CreatePatientContractSchema.parse(await request.json());

    if (d.templateId) {
      const tpl = await prisma.contractTemplate.findFirst({
        where: { id: d.templateId, companyId: dbUser!.companyId, deletedAt: null },
      });
      if (!tpl) return NextResponse.json({ error: 'Modelo de contrato inválido' }, { status: 400 });
    }

    const contract = await prisma.patientContract.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: patient!.id,
        templateId: d.templateId || null,
        title: d.title,
        content: d.content,
        variables: d.variables ?? undefined,
        value: d.value ?? null,
        status: d.status || 'DRAFT',
        createdById: dbUser!.id,
        ...(d.status === 'SENT' && { sentAt: new Date() }),
        ...(d.status === 'SIGNED' && { signedAt: new Date() }),
      },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'CREATE', entityType: 'CONTRACT', entityId: contract.id,
      newValues: { patientId: patient!.id, title: contract.title, status: contract.status }, request,
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
