import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { UpdateSupplierSchema } from '@/lib/validations/financial';

// PATCH /api/financeiro/suppliers/[id] — edita o cadastro do fornecedor
// (nome/documento/contato/observações) e ativa/desativa. Cadastro mestre:
// NÃO altera valores de despesas (Payable) já lançadas. Auditado.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = UpdateSupplierSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });

    const d = parsed.data;
    const updated = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.supplier.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
      if (!cur) return { cur: null as any, row: null as any };
      const row = await tx.supplier.update({
        where: { id: params.id },
        data: {
          ...(d.name !== undefined && { name: d.name }),
          ...(d.document !== undefined && { document: d.document || null }),
          ...(d.email !== undefined && { email: d.email || null }),
          ...(d.phone !== undefined && { phone: d.phone || null }),
          ...(d.notes !== undefined && { notes: d.notes || null }),
          ...(d.isActive !== undefined && { isActive: d.isActive }),
        },
      });
      return { cur, row };
    });
    if (!updated.row) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 });

    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'SUPPLIER', entityId: params.id, oldValues: updated.cur, newValues: updated.row, request });
    return NextResponse.json(updated.row);
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe fornecedor com esse nome' }, { status: 409 });
    console.error('Erro ao atualizar fornecedor:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/financeiro/suppliers/[id] — soft-delete. Bloqueado se houver
// despesas vinculadas (preserva rastreabilidade) — nesse caso, desative.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const result = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      const cur = await tx.supplier.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null }, select: { id: true } });
      if (!cur) return 'notfound';
      const inUse = await tx.payable.findFirst({ where: { supplierId: params.id, deletedAt: null }, select: { id: true } });
      if (inUse) return 'inuse';
      await tx.supplier.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
      return 'ok';
    });
    if (result === 'notfound') return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 });
    if (result === 'inuse') return NextResponse.json({ error: 'Fornecedor com despesas vinculadas. Desative-o em vez de excluir.' }, { status: 409 });

    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'SUPPLIER', entityId: params.id, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir fornecedor:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
