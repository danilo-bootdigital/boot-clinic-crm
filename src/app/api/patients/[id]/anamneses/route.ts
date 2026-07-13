import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { CreatePatientAnamnesisSchema } from '@/lib/validations/clinical';

// GET /api/patients/[id]/anamneses - anamneses do paciente.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'anamnese', 'view');
    if (error) return error;
    const rows = await prisma.patientAnamnesis.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      include: { answers: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar anamneses:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/anamneses - cria uma anamnese preenchida.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'anamnese', 'edit');
    if (error) return error;
    const d = CreatePatientAnamnesisSchema.parse(await request.json());
    const notes = d.notes?.trim() ? d.notes : null;

    // Se referencia um modelo, valida posse pela empresa.
    if (d.templateId) {
      const tpl = await prisma.anamnesisTemplate.findFirst({
        where: { id: d.templateId, companyId: dbUser!.companyId, deletedAt: null },
      });
      if (!tpl) return NextResponse.json({ error: 'Modelo de anamnese inválido' }, { status: 400 });
    } else if (!notes) {
      // Modo texto livre: o conteúdo passa a ser obrigatório.
      return NextResponse.json({ error: 'Informe o conteúdo da anamnese', field: 'notes' }, { status: 400 });
    }

    const anamnesis = await prisma.patientAnamnesis.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: patient!.id,
        templateId: d.templateId || null,
        title: d.title,
        notes,
        status: d.status || 'DRAFT',
        createdById: dbUser!.id,
        answers: d.answers?.length
          ? {
              create: d.answers.map((a) => ({
                companyId: dbUser!.companyId,
                questionId: a.questionId || null,
                label: a.label,
                value: a.value ?? null,
                fileUrl: a.fileUrl ?? null,
              })),
            }
          : undefined,
      },
      include: { answers: true },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'CREATE', entityType: 'ANAMNESIS', entityId: anamnesis.id,
      newValues: { patientId: patient!.id, title: anamnesis.title, status: anamnesis.status }, request,
    });

    return NextResponse.json(anamnesis, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
