import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { CategorySchema } from '@/lib/validations/stock';
import { ensureStockDefaults, stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/categories — categorias da clínica (com contagem de itens).
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const rows = await withFinanceTenant(companyId, async (tx) => {
      await ensureStockDefaults(tx, companyId);
      const [cats, counts] = await Promise.all([
        tx.stockCategory.findMany({ where: { companyId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
        tx.stockItem.groupBy({ by: ['categoryId'], where: { companyId, deletedAt: null }, _count: { _all: true } }),
      ]);
      const by = new Map(counts.map((c) => [c.categoryId, c._count._all]));
      return cats.map((c) => ({ ...c, itemCount: by.get(c.id) ?? 0 }));
    });
    return NextResponse.json(rows);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'categories GET');
  }
}

// POST /api/estoque/categories
export async function POST(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = CategorySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.stockCategory.create({ data: { companyId: dbUser!.companyId, ...parsed.data } }),
    );
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'STOCK_CATEGORY', entityId: created.id, newValues: created, request });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'categories POST');
  }
}
