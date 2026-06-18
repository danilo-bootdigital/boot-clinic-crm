import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { UpdatePatientContractSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.patientContract.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'view');
    if (error) return error;
    const row = await findOwned(params.id, dbUser!.companyId);
    if (!row) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('Erro ao buscar contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - atualiza dados/status. Carimba datas conforme a transição de status.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    const d = UpdatePatientContractSchema.parse(await request.json());

    const statusStamp: any = {};
    if (d.status && d.status !== existing.status) {
      if (d.status === 'SENT') statusStamp.sentAt = new Date();
      if (d.status === 'SIGNED') statusStamp.signedAt = new Date();
      if (d.status === 'CANCELED') statusStamp.canceledAt = new Date();
    }

    const row = await prisma.patientContract.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.content !== undefined && { content: d.content }),
        ...(d.variables !== undefined && { variables: d.variables }),
        ...(d.value !== undefined && { value: d.value }),
        ...(d.status !== undefined && { status: d.status }),
        ...statusStamp,
      },
    });
    await writeAudit({
      dbUser: dbUser!, action: 'UPDATE', entityType: 'CONTRACT', entityId: params.id,
      oldValues: { status: existing.status }, newValues: { status: row.status }, request,
    });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    await prisma.patientContract.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'CONTRACT', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
