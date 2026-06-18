import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { UpdateNamedCatalogSchema } from '@/lib/validations/financial';

// PATCH /api/financeiro/cost-centers/[id] — renomeia / ativa-desativa / reordena.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = UpdateNamedCatalogSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });

    const updated = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.costCenter.findFirst({ where: { id: params.id, companyId: dbUser!.companyId }, select: { id: true } });
      if (!cur) return null;
      return tx.costCenter.update({ where: { id: params.id }, data: parsed.data });
    });
    if (!updated) return NextResponse.json({ error: 'Centro de custo não encontrado' }, { status: 404 });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'COST_CENTER', entityId: params.id, newValues: parsed.data, request });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe centro de custo com esse nome' }, { status: 409 });
    console.error('Erro ao atualizar centro de custo:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/financeiro/cost-centers/[id] — exclui (bloqueado se em uso → 409).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const done = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.costCenter.findFirst({ where: { id: params.id, companyId: dbUser!.companyId }, select: { id: true } });
      if (!cur) return false;
      await tx.costCenter.delete({ where: { id: params.id } });
      return true;
    });
    if (!done) return NextResponse.json({ error: 'Centro de custo não encontrado' }, { status: 404 });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'COST_CENTER', entityId: params.id, request });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2003') return NextResponse.json({ error: 'Centro de custo em uso por despesas. Desative-o em vez de excluir.' }, { status: 409 });
    console.error('Erro ao excluir centro de custo:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
