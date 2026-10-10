import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { ReverseSchema } from '@/lib/validations/stock';
import { reverseMovement } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

// POST /api/estoque/movements/:id/reverse — estorno com motivo (o razão nunca é editado).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('adjust');
  if (error) return error;
  const parsed = ReverseSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const created = await withFinanceTenant(actor.companyId, (tx) => reverseMovement(tx, actor, params.id, parsed.data.reason));
    await writeAudit({
      dbUser: actor, action: 'REVERSE', entityType: 'STOCK_MOVEMENT', entityId: params.id,
      newValues: { reason: parsed.data.reason, reversals: created.map((c) => c.id) }, request,
    });
    return NextResponse.json(stockJson(created, stockCan(actor.role, 'view_cost')), { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'movement reverse');
  }
}
