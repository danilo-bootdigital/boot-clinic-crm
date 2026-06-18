import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { UpdateNamedCatalogSchema } from '@/lib/validations/financial';

// PATCH /api/financeiro/expense-categories/[id] — renomeia / ativa-desativa / reordena.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = UpdateNamedCatalogSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });

    const updated = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.expenseCategory.findFirst({ where: { id: params.id, companyId: dbUser!.companyId }, select: { id: true } });
      if (!cur) return null;
      return tx.expenseCategory.update({ where: { id: params.id }, data: parsed.data });
    });
    if (!updated) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'EXPENSE_CATEGORY', entityId: params.id, newValues: parsed.data, request });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe categoria com esse nome' }, { status: 409 });
    console.error('Erro ao atualizar categoria de despesa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/financeiro/expense-categories/[id] — exclui (bloqueado se em uso → 409).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const done = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.expenseCategory.findFirst({ where: { id: params.id, companyId: dbUser!.companyId }, select: { id: true } });
      if (!cur) return false;
      await tx.expenseCategory.delete({ where: { id: params.id } });
      return true;
    });
    if (!done) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'EXPENSE_CATEGORY', entityId: params.id, request });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2003') return NextResponse.json({ error: 'Categoria em uso por despesas. Desative-a em vez de excluir.' }, { status: 409 });
    console.error('Erro ao excluir categoria de despesa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
