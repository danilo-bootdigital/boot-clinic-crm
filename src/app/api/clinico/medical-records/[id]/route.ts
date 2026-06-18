import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { UpdateMedicalRecordSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.medicalRecord.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('prontuario', 'view');
    if (error) return error;
    const row = await prisma.medicalRecord.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { attachments: true },
    });
    if (!row) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('Erro ao buscar registro de prontuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('prontuario', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    const d = UpdateMedicalRecordSchema.parse(await request.json());

    if (d.professionalId) {
      const prof = await prisma.professional.findFirst({ where: { id: d.professionalId, companyId: dbUser!.companyId } });
      if (!prof) return NextResponse.json({ error: 'Profissional inválido' }, { status: 400 });
    }

    const row = await prisma.medicalRecord.update({
      where: { id: params.id },
      data: {
        ...(d.type !== undefined && { type: d.type }),
        ...(d.title !== undefined && { title: d.title }),
        ...(d.content !== undefined && { content: d.content }),
        ...(d.professionalId !== undefined && { professionalId: d.professionalId || null }),
      },
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'MEDICAL_RECORD', entityId: params.id, newValues: { title: row.title }, request });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar registro de prontuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('prontuario', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    await prisma.medicalRecord.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'MEDICAL_RECORD', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir registro de prontuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
