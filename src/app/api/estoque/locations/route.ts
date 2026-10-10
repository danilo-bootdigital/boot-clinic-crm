import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { LocationSchema } from '@/lib/validations/stock';
import { ensureStockDefaults, stockErrorResponse } from '@/lib/stock/http';
import { applyLocationRules } from '@/lib/stock/locations';

// GET /api/estoque/locations — locais da clínica (com nº de itens com saldo).
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const rows = await withFinanceTenant(companyId, async (tx) => {
      await ensureStockDefaults(tx, companyId);
      const [locs, counts] = await Promise.all([
        tx.stockLocation.findMany({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
        tx.stockBalance.groupBy({ by: ['locationId'], where: { companyId, quantity: { gt: 0 } }, _count: { _all: true } }),
      ]);
      const by = new Map(counts.map((c) => [c.locationId, c._count._all]));
      return locs.map((l) => ({ ...l, balanceCount: by.get(l.id) ?? 0 }));
    });
    return NextResponse.json(rows);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'locations GET');
  }
}

// POST /api/estoque/locations
export async function POST(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = LocationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const companyId = dbUser!.companyId;
    const created = await withFinanceTenant(companyId, async (tx) => {
      const data = { ...parsed.data };
      await applyLocationRules(tx, companyId, data);
      return tx.stockLocation.create({ data: { companyId, ...data } });
    });
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'STOCK_LOCATION', entityId: created.id, newValues: created, request });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'locations POST');
  }
}
