import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { CreateItemSchema } from '@/lib/validations/stock';
import { normalizeItem, pickWritable, summarizeItems } from '@/lib/stock/items';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/items — catálogo com saldo total, situação e validade.
// Filtros: ?q= &categoryId= &kind= &controlled=1 &status=ok|repor|critico|zerado &inactive=1 &locationId=
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const companyId = dbUser!.companyId;
    const q = sp.get('q')?.trim();
    const rows = await withFinanceTenant(companyId, async (tx) => {
      const settings = await tx.stockSettings.findUnique({ where: { companyId } });
      let itemIds: string[] | undefined;
      if (sp.get('locationId')) {
        const inLoc = await tx.stockBalance.findMany({
          where: { companyId, locationId: sp.get('locationId')!, quantity: { gt: 0 } },
          select: { itemId: true },
          distinct: ['itemId'],
        });
        itemIds = inLoc.map((b) => b.itemId);
      }
      const items = await tx.stockItem.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...(sp.get('inactive') === '1' ? {} : { isActive: true }),
          ...(sp.get('categoryId') ? { categoryId: sp.get('categoryId')! } : {}),
          ...(sp.get('kind') ? { kind: sp.get('kind') as any } : {}),
          ...(sp.get('controlled') === '1' ? { isControlled: true } : {}),
          ...(itemIds ? { id: { in: itemIds } } : {}),
          ...(q
            ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: q }, { manufacturer: { contains: q, mode: 'insensitive' } }] }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 1000,
      });
      const summary = await summarizeItems(tx, companyId, items, settings?.expiryAlertDays ?? 60);
      const status = sp.get('status');
      return status ? summary.filter((i) => i.status === status) : summary;
    });
    return NextResponse.json(stockJson(rows, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'items GET');
  }
}

// POST /api/estoque/items — cadastra item (controlado: lista + observação, §5.11).
export async function POST(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = CreateItemSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: first || 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const companyId = dbUser!.companyId;
    const created = await withFinanceTenant(companyId, async (tx) => {
      const data = await normalizeItem(tx, companyId, pickWritable(parsed.data));
      return tx.stockItem.create({ data: { companyId, ...(data as any) } });
    });
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'STOCK_ITEM', entityId: created.id, newValues: created, request });
    return NextResponse.json(stockJson(created, true), { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'items POST');
  }
}
