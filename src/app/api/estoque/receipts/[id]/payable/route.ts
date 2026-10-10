import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { payableCan } from '@/lib/financial-caps';
import { ReceiptPayableSchema } from '@/lib/validations/stock';
import { generatePendingPayable } from '@/lib/stock/receipts';
import { closePendingPayableTask } from '@/lib/stock/alerts';
import { stockErrorResponse } from '@/lib/stock/http';

// POST /api/estoque/receipts/:id/payable — financeiro lança a conta pendente.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  if (!payableCan(dbUser!.role, 'create')) return NextResponse.json({ error: 'Sem permissão para Contas a Pagar' }, { status: 403 });
  const parsed = ReceiptPayableSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const done = await withFinanceTenant(actor.companyId, (tx) => generatePendingPayable(tx, actor, params.id, parsed.data));
    await writeAudit({ dbUser: actor, action: 'UPDATE', entityType: 'STOCK_RECEIPT', entityId: done.id, newValues: { payableIds: done.payableIds }, request });
    await closePendingPayableTask(actor, done.id);
    return NextResponse.json(stockJson(done, true));
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'receipt payable');
  }
}
