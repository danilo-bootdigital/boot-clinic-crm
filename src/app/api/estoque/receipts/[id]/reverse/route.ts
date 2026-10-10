import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { payableCan } from '@/lib/financial-caps';
import { ReverseSchema } from '@/lib/validations/stock';
import { reverseReceipt } from '@/lib/stock/receipts';
import { closePendingPayableTask } from '@/lib/stock/alerts';
import { stockErrorResponse } from '@/lib/stock/http';

// POST /api/estoque/receipts/:id/reverse — desfaz entradas e cancela as contas.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('adjust');
  if (error) return error;
  const parsed = ReverseSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const done = await withFinanceTenant(
      actor.companyId,
      (tx) => reverseReceipt(tx, actor, params.id, parsed.data.reason, payableCan(actor.role, 'cancel')),
      { timeout: 60_000 },
    );
    await writeAudit({ dbUser: actor, action: 'REVERSE', entityType: 'STOCK_RECEIPT', entityId: done.id, newValues: { reason: parsed.data.reason, canceledPayables: done.payableIds }, request });
    await closePendingPayableTask(actor, done.id);
    return NextResponse.json(stockJson(done, true));
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'receipt reverse');
  }
}
