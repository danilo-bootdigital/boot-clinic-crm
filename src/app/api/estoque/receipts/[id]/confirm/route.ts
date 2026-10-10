import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { payableCan } from '@/lib/financial-caps';
import { ReceiptConfirmSchema } from '@/lib/validations/stock';
import { confirmReceipt } from '@/lib/stock/receipts';
import { reportPendingPayable } from '@/lib/stock/alerts';
import { stockErrorResponse } from '@/lib/stock/http';

// POST /api/estoque/receipts/:id/confirm — entradas com custo rateado + conta(s) a pagar.
// Sem acesso a Contas a Pagar (ex.: recepção), a entrada física é confirmada e a
// conta fica pendente para o financeiro (tarefa + sino).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  const parsed = ReceiptConfirmSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const canCreatePayable = payableCan(actor.role, 'create');
    const done = await withFinanceTenant(
      actor.companyId,
      (tx) => confirmReceipt(tx, actor, params.id, { ...parsed.data, canCreatePayable }),
      { timeout: 60_000 },
    );
    await writeAudit({
      dbUser: actor, action: 'UPDATE_STATUS', entityType: 'STOCK_RECEIPT', entityId: done.id,
      newValues: { status: done.status, total: done.total, payableIds: done.payableIds, payablePending: done.payablePending }, request,
    });
    if (done.payablePending) await reportPendingPayable(actor, done);
    return NextResponse.json(stockJson(done, true));
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'receipt confirm');
  }
}
