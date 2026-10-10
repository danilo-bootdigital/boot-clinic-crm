import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { KitSchema } from '@/lib/validations/stock';
import { listKits, saveKit } from '@/lib/stock/kits';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/kits — fichas técnicas (custo estimado só p/ quem vê custo).
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const rows = await withFinanceTenant(dbUser!.companyId, (tx) => listKits(tx, dbUser!.companyId));
    return NextResponse.json(stockJson(rows, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'kits GET');
  }
}

// POST /api/estoque/kits
export async function POST(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = KitSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  try {
    const kit = await withFinanceTenant(dbUser!.companyId, (tx) => saveKit(tx, dbUser!.companyId, null, parsed.data));
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'PROCEDURE_KIT', entityId: kit.id, newValues: parsed.data, request });
    return NextResponse.json(stockJson(kit, true), { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'kits POST');
  }
}
