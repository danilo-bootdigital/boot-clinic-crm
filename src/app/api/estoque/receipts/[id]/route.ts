import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { prisma } from '@/lib/db/prisma';
import { writeAudit } from '@/lib/api/audit';
import { payableCan } from '@/lib/financial-caps';
import { ReceiptDraftSchema } from '@/lib/validations/stock';
import { saveReceiptDraft } from '@/lib/stock/receipts';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

type Ctx = { params: { id: string } };

// GET /api/estoque/receipts/:id — recebimento com linhas e contas geradas.
// Valores da NOTA aparecem para quem confere (`receive`); o custo rateado por
// unidade base segue a regra de `view_cost` (decisão registrada na diretriz §13).
export async function GET(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const seesPayables = payableCan(dbUser!.role, 'view');
    const data = await withFinanceTenant(companyId, async (tx) => {
      const r = await tx.stockReceipt.findFirst({ where: { id: params.id, companyId }, include: { items: { orderBy: { order: 'asc' } } } });
      if (!r) throw new StockError(404, 'Recebimento não encontrado');
      const [items, locs, supplier, payables] = await Promise.all([
        tx.stockItem.findMany({
          where: { companyId, id: { in: r.items.map((l) => l.itemId) } },
          select: { id: true, name: true, baseUnit: true, purchaseUnit: true, conversionFactor: true, tracksLot: true, tracksExpiry: true, isControlled: true, controlledList: true, controlledNote: true, storageTemp: true },
        }),
        tx.stockLocation.findMany({ where: { companyId, id: { in: r.items.map((l) => l.locationId) } }, select: { id: true, name: true } }),
        r.supplierId ? tx.supplier.findFirst({ where: { id: r.supplierId, companyId }, select: { id: true, name: true } }) : null,
        seesPayables && r.payableIds.length > 0
          ? tx.payable.findMany({ where: { companyId, id: { in: r.payableIds } }, select: { id: true, description: true, finalAmount: true, paidAmount: true, status: true, dueDate: true }, orderBy: { dueDate: 'asc' } })
          : [],
      ]);
      const itemBy = new Map(items.map((i) => [i.id, i]));
      const locBy = new Map(locs.map((l) => [l.id, l.name]));
      const people = await prisma.user.findMany({
        where: { companyId, id: { in: [r.createdById, r.confirmedById, r.reversedById].filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      });
      const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? '—' : null);
      return {
        ...r,
        supplierName: supplier?.name ?? null,
        createdByName: nameOf(r.createdById),
        confirmedByName: nameOf(r.confirmedById),
        reversedByName: nameOf(r.reversedById),
        items: r.items.map((l) => ({ ...l, item: itemBy.get(l.itemId) ?? null, locationName: locBy.get(l.locationId) ?? '—' })),
        payables: payables.map((p) => ({ ...p, amount: p.finalAmount, paid: p.paidAmount })),
        payableCount: r.payableIds.length,
      };
    });
    // amount/paid/finalAmount/paidAmount de Payable só existem para quem vê Contas a Pagar.
    return NextResponse.json(stockJson(data, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'receipt GET');
  }
}

// PATCH /api/estoque/receipts/:id — substitui o rascunho (cabeçalho + linhas).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  const parsed = ReceiptDraftSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const saved = await withFinanceTenant(actor.companyId, (tx) => saveReceiptDraft(tx, actor, params.id, parsed.data));
    return NextResponse.json(stockJson(saved, true));
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'receipt PATCH');
  }
}

// DELETE /api/estoque/receipts/:id — descarta rascunho (confirmado só se estorna).
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const removed = await withFinanceTenant(companyId, async (tx) => {
      const r = await tx.stockReceipt.findFirst({ where: { id: params.id, companyId } });
      if (!r) throw new StockError(404, 'Recebimento não encontrado');
      if (r.status !== 'RASCUNHO') throw new StockError(409, 'Recebimento confirmado não é excluído: estorne-o');
      await tx.stockReceipt.delete({ where: { id: r.id } });
      return r;
    });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'STOCK_RECEIPT', entityId: removed.id, oldValues: { number: removed.number }, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'receipt DELETE');
  }
}
