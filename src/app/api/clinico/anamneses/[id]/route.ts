import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { UpdatePatientAnamnesisSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.patientAnamnesis.findFirst({ where: { id, companyId, deletedAt: null } });
}

// GET - detalhe (com respostas).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'view');
    if (error) return error;
    const row = await prisma.patientAnamnesis.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { answers: true },
    });
    if (!row) return NextResponse.json({ error: 'Anamnese não encontrada' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('Erro ao buscar anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - atualiza título/status e (opcional) substitui respostas.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Anamnese não encontrada' }, { status: 404 });

    const d = UpdatePatientAnamnesisSchema.parse(await request.json());
    const markReviewed = d.status === 'REVIEWED' && existing.status !== 'REVIEWED';

    const row = await prisma.$transaction(async (tx) => {
      await tx.patientAnamnesis.update({
        where: { id: params.id },
        data: {
          ...(d.title !== undefined && { title: d.title }),
          ...(d.notes !== undefined && { notes: d.notes && d.notes.trim() ? d.notes : null }),
          ...(d.status !== undefined && { status: d.status }),
          ...(markReviewed && { reviewedById: dbUser!.id, reviewedAt: new Date() }),
        },
      });
      if (d.answers) {
        await tx.patientAnamnesisAnswer.deleteMany({ where: { anamnesisId: params.id } });
        if (d.answers.length) {
          await tx.patientAnamnesisAnswer.createMany({
            data: d.answers.map((a) => ({
              anamnesisId: params.id,
              companyId: dbUser!.companyId,
              questionId: a.questionId || null,
              label: a.label,
              value: a.value ?? null,
              fileUrl: a.fileUrl ?? null,
            })),
          });
        }
      }
      return tx.patientAnamnesis.findUnique({ where: { id: params.id }, include: { answers: true } });
    });

    await writeAudit({
      dbUser: dbUser!, action: 'UPDATE', entityType: 'ANAMNESIS', entityId: params.id,
      oldValues: { status: existing.status }, newValues: { status: row?.status }, request,
    });

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE - soft delete (arquiva).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Anamnese não encontrada' }, { status: 404 });
    await prisma.patientAnamnesis.update({ where: { id: params.id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'ANAMNESIS', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
