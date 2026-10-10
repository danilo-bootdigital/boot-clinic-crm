import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { CategorySchema } from '@/lib/validations/stock';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

type Ctx = { params: { id: string } };

// PATCH /api/estoque/categories/:id — renomear, reordenar, ativar/desativar.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = CategorySchema.partial().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const companyId = dbUser!.companyId;
    const [before, after] = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockCategory.findFirst({ where: { id: params.id, companyId } });
      if (!b) throw new StockError(404, 'Categoria não encontrada');
      return [b, await tx.stockCategory.update({ where: { id: b.id }, data: parsed.data })];
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'STOCK_CATEGORY', entityId: after.id, oldValues: before, newValues: after, request });
    return NextResponse.json(after);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'category PATCH');
  }
}

// DELETE /api/estoque/categories/:id — só sem itens vinculados (senão, desativar).
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const removed = await withFinanceTenant(companyId, async (tx) => {
      const c = await tx.stockCategory.findFirst({ where: { id: params.id, companyId } });
      if (!c) throw new StockError(404, 'Categoria não encontrada');
      const used = await tx.stockItem.count({ where: { companyId, categoryId: c.id, deletedAt: null } });
      if (used > 0) throw new StockError(409, `A categoria tem ${used} item(ns). Mova os itens ou desative a categoria.`);
      await tx.stockCategory.delete({ where: { id: c.id } });
      return c;
    });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'STOCK_CATEGORY', entityId: removed.id, oldValues: removed, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'category DELETE');
  }
}
