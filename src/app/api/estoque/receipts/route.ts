import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { ReceiptDraftSchema } from '@/lib/validations/stock';
import { saveReceiptDraft } from '@/lib/stock/receipts';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/receipts — recebimentos (?status=RASCUNHO|CONFIRMADO|ESTORNADO &pending=1).
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const companyId = dbUser!.companyId;
    const rows = await withFinanceTenant(companyId, async (tx) => {
      const list = await tx.stockReceipt.findMany({
        where: {
          companyId,
          ...(sp.get('status') ? { status: sp.get('status') as any } : {}),
          ...(sp.get('pending') === '1' ? { payablePending: true } : {}),
        },
        orderBy: { number: 'desc' },
        take: 300,
        include: { _count: { select: { items: true } } },
      });
      const suppliers = await tx.supplier.findMany({
        where: { companyId, id: { in: list.map((r) => r.supplierId).filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      const sBy = new Map(suppliers.map((s) => [s.id, s.name]));
      return list.map(({ _count, ...r }) => ({ ...r, supplierName: r.supplierId ? sBy.get(r.supplierId) ?? null : null, itemCount: _count.items }));
    });
    return NextResponse.json(stockJson(rows, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'receipts GET');
  }
}

// POST /api/estoque/receipts — abre um rascunho de recebimento.
export async function POST(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  const parsed = ReceiptDraftSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  const create = () => withFinanceTenant(actor.companyId, (tx) => saveReceiptDraft(tx, actor, null, parsed.data));
  try {
    // Número sequencial por clínica: dois rascunhos simultâneos colidem no unique → tenta de novo.
    const created = await create().catch((e) => (e?.code === 'P2002' ? create() : Promise.reject(e)));
    await writeAudit({ dbUser: actor, action: 'CREATE', entityType: 'STOCK_RECEIPT', entityId: created.id, newValues: { number: created.number }, request });
    return NextResponse.json(stockJson(created, true), { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'receipts POST');
  }
}
