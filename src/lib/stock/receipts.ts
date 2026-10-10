import type { StockReceipt, StockReceiptItem } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { createPayable, cancelPayable, ensureExpenseCatalog } from '@/lib/api/payable-service';
import { applyEntry, loadLocation, lockItem, reverseMovement, InsufficientBalanceError, StockError, type Actor } from '@/lib/stock/movements';
import { allocateCents, round, splitInstallments } from '@/lib/stock/rules';
import type { ReceiptConfirmInput, ReceiptDraftInput, ReceiptPayableInput } from '@/lib/validations/stock';

// ============================================================================
// Recebimento de mercadoria (Fase 2, §6 "Contas a Pagar"). Rascunho = conferência
// editável. Confirmar, numa transação só: ENTRADA_COMPRA por linha (frete e
// desconto rateados no custo, proporcional ao valor de cada linha) + conta(s) a
// pagar. Estornar desfaz as entradas e cancela as contas — só se nada foi pago.
// ============================================================================

export const MATERIAL_CATEGORY = 'Material clínico';

const cents = (n: number) => Math.round(n * 100);
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d.toString()));
const decimal = (n: number, places: number) => new Prisma.Decimal(round(n, places).toFixed(places));

export function receiptTotals(lines: { qtyPurchase: number; unitPrice: number }[], freight: number, discount: number) {
  const lineCents = lines.map((l) => cents(l.qtyPurchase * l.unitPrice));
  const itemsCents = lineCents.reduce((s, c) => s + c, 0);
  const totalCents = itemsCents + cents(freight) - cents(discount);
  return { lineCents, itemsCents, totalCents };
}

async function lockReceipt(tx: TxClient, companyId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM stock_receipts WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const r = await tx.stockReceipt.findFirst({ where: { id, companyId }, include: { items: { orderBy: { order: 'asc' } } } });
  if (!r) throw new StockError(404, 'Recebimento não encontrado');
  return r;
}

// Cria (id = null) ou substitui o rascunho inteiro (cabeçalho + linhas).
export async function saveReceiptDraft(tx: TxClient, actor: Actor, id: string | null, input: ReceiptDraftInput) {
  const companyId = actor.companyId;
  if (input.supplierId) {
    const s = await tx.supplier.findFirst({ where: { id: input.supplierId, companyId, deletedAt: null }, select: { id: true } });
    if (!s) throw new StockError(404, 'Fornecedor não encontrado');
  }
  const itemIds = Array.from(new Set(input.items.map((l) => l.itemId)));
  const locIds = Array.from(new Set(input.items.map((l) => l.locationId)));
  const [items, locs] = await Promise.all([
    tx.stockItem.findMany({ where: { companyId, id: { in: itemIds }, deletedAt: null }, select: { id: true, name: true, isActive: true } }),
    tx.stockLocation.findMany({ where: { companyId, id: { in: locIds } }, select: { id: true, isActive: true } }),
  ]);
  if (items.length !== itemIds.length) throw new StockError(404, 'Item não encontrado em uma das linhas');
  const inactive = items.find((i) => !i.isActive);
  if (inactive) throw new StockError(400, `O item ${inactive.name} está inativo`);
  if (locs.length !== locIds.length || locs.some((l) => !l.isActive)) throw new StockError(400, 'Local inválido ou inativo em uma das linhas');

  const { totalCents, itemsCents } = receiptTotals(input.items, input.freight, input.discount);
  if (cents(input.discount) > itemsCents + cents(input.freight)) throw new StockError(400, 'O desconto não pode ser maior que o valor da nota');

  const header = {
    supplierId: input.supplierId ?? null,
    invoiceNumber: input.invoiceNumber || null,
    invoiceKey: input.invoiceKey || null,
    invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
    receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
    freight: decimal(input.freight, 2),
    discount: decimal(input.discount, 2),
    total: new Prisma.Decimal((totalCents / 100).toFixed(2)),
    notes: input.notes || null,
  };

  let receipt: StockReceipt;
  if (id) {
    const current = await lockReceipt(tx, companyId, id);
    if (current.status !== 'RASCUNHO') throw new StockError(409, 'Só o rascunho pode ser editado');
    receipt = await tx.stockReceipt.update({ where: { id }, data: header });
    await tx.stockReceiptItem.deleteMany({ where: { companyId, receiptId: id } });
  } else {
    const last = await tx.stockReceipt.aggregate({ where: { companyId }, _max: { number: true } });
    receipt = await tx.stockReceipt.create({ data: { companyId, number: (last._max.number ?? 0) + 1, createdById: actor.id, ...header } });
  }
  if (input.items.length > 0) {
    await tx.stockReceiptItem.createMany({
      data: input.items.map((l, order) => ({
        companyId,
        receiptId: receipt.id,
        itemId: l.itemId,
        lotNumber: l.lotNumber?.trim() || null,
        expiresAt: l.expiresAt ? new Date(l.expiresAt) : null,
        locationId: l.locationId,
        qtyPurchase: decimal(l.qtyPurchase, 4),
        unitPrice: decimal(l.unitPrice, 2),
        order,
      })),
    });
  }
  return receipt;
}

// Gera a(s) conta(s) a pagar do recebimento confirmado (parcelas = N contas).
async function createReceiptPayables(tx: TxClient, actor: Actor, r: StockReceipt, opts: ReceiptPayableInput) {
  const companyId = actor.companyId;
  const totalCents = cents(num(r.total));
  if (totalCents <= 0) throw new StockError(400, 'Recebimento sem valor: não há conta a pagar a gerar');

  await ensureExpenseCatalog(tx, companyId);
  let categoryId = opts.categoryId ?? null;
  if (!categoryId) {
    const cat = await tx.expenseCategory.upsert({
      where: { companyId_name: { companyId, name: MATERIAL_CATEGORY } },
      update: {},
      create: { companyId, name: MATERIAL_CATEGORY, isDefault: true, order: 99 },
    });
    categoryId = cat.id;
  }
  const supplier = r.supplierId ? await tx.supplier.findFirst({ where: { id: r.supplierId, companyId }, select: { name: true } }) : null;
  const base = new Date(opts.firstDueDate ?? Date.now() + 30 * 86_400_000);
  const parts = splitInstallments(totalCents, opts.installments);
  const label = `NF ${r.invoiceNumber || 's/n'}${supplier ? ` — ${supplier.name}` : ''} (recebimento #${r.number})`;

  const ids: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = await createPayable(tx, companyId, actor.id, {
      supplierId: r.supplierId ?? undefined,
      categoryId,
      costCenterId: opts.costCenterId ?? undefined,
      description: parts.length > 1 ? `${label} · parcela ${i + 1}/${parts.length}` : label,
      originalAmount: parts[i] / 100,
      discountAmount: 0,
      dueDate: new Date(base.getTime() + i * opts.intervalDays * 86_400_000),
      issueDate: r.invoiceDate ?? undefined,
      notes: `Gerada pelo recebimento de estoque #${r.number}.`,
    });
    ids.push(p.id);
  }
  return ids;
}

// Confirma: entradas (custo rateado) + contas a pagar, tudo ou nada.
export async function confirmReceipt(tx: TxClient, actor: Actor, id: string, opts: ReceiptConfirmInput & { canCreatePayable: boolean }) {
  const r = await lockReceipt(tx, actor.companyId, id);
  if (r.status !== 'RASCUNHO') throw new StockError(409, 'Este recebimento já foi confirmado');
  if (r.items.length === 0) throw new StockError(400, 'Inclua ao menos um item antes de confirmar');

  const lines = r.items.map((l) => ({ qtyPurchase: num(l.qtyPurchase), unitPrice: num(l.unitPrice) }));
  const { lineCents, totalCents } = receiptTotals(lines, num(r.freight), num(r.discount));
  // Custo líquido de cada linha = valor da linha + frete − desconto, rateados pelo valor.
  const netCents = allocateCents(totalCents, lineCents);

  for (let i = 0; i < r.items.length; i++) {
    const line: StockReceiptItem = r.items[i];
    const item = await lockItem(tx, actor.companyId, line.itemId);
    const loc = await loadLocation(tx, actor.companyId, line.locationId);
    const qtyBase = round(num(line.qtyPurchase) * num(item.conversionFactor), 4);
    const unitCost = qtyBase > 0 ? netCents[i] / 100 / qtyBase : 0;
    const mv = await applyEntry(tx, actor, {
      item, loc, type: 'ENTRADA_COMPRA', qty: qtyBase, unitCost, updateLastCost: true,
      lotNumber: line.lotNumber, expiresAt: line.expiresAt?.toISOString() ?? null,
      supplierId: r.supplierId, receiptId: r.id, confirmTemperature: opts.confirmTemperature,
      reason: `Recebimento #${r.number}${r.invoiceNumber ? ` · NF ${r.invoiceNumber}` : ''}`,
    });
    await tx.stockReceiptItem.update({ where: { id: line.id }, data: { unitCost: decimal(unitCost, 6), movementId: mv.id } });
  }

  const wantsPayable = opts.generatePayable && totalCents > 0;
  const payableIds = wantsPayable && opts.canCreatePayable ? await createReceiptPayables(tx, actor, r, opts) : [];
  return tx.stockReceipt.update({
    where: { id: r.id },
    data: {
      status: 'CONFIRMADO',
      confirmedAt: new Date(),
      confirmedById: actor.id,
      payableIds,
      payablePending: wantsPayable && !opts.canCreatePayable,
    },
  });
}

// Financeiro gera a conta de um recebimento confirmado por quem não tinha acesso.
export async function generatePendingPayable(tx: TxClient, actor: Actor, id: string, opts: ReceiptPayableInput) {
  const r = await lockReceipt(tx, actor.companyId, id);
  if (r.status !== 'CONFIRMADO') throw new StockError(409, 'Só recebimento confirmado gera conta a pagar');
  if (r.payableIds.length > 0) throw new StockError(409, 'Este recebimento já tem conta a pagar');
  const payableIds = await createReceiptPayables(tx, actor, r, opts);
  return tx.stockReceipt.update({ where: { id: r.id }, data: { payableIds, payablePending: false } });
}

// Estorno: desfaz as entradas e cancela as contas. Conta paga bloqueia (exige
// devolução ao fornecedor); material já consumido também bloqueia.
export async function reverseReceipt(tx: TxClient, actor: Actor, id: string, reason: string, canCancelPayable: boolean) {
  const r = await lockReceipt(tx, actor.companyId, id);
  if (r.status !== 'CONFIRMADO') throw new StockError(409, 'Só recebimento confirmado pode ser estornado');

  if (r.payableIds.length > 0) {
    const payables = await tx.payable.findMany({ where: { companyId: actor.companyId, id: { in: r.payableIds } }, select: { id: true, status: true, paidAmount: true } });
    if (payables.some((p) => p.status !== 'CANCELADO' && num(p.paidAmount) > 0)) {
      throw new StockError(409, 'A conta a pagar deste recebimento já tem pagamento. Estorne o pagamento no financeiro ou registre uma devolução ao fornecedor.');
    }
    if (!canCancelPayable) throw new StockError(403, 'O estorno cancela a conta a pagar: precisa de acesso a Contas a Pagar.');
  }

  for (const line of r.items) {
    if (!line.movementId) continue;
    try {
      await reverseMovement(tx, actor, line.movementId, `Estorno do recebimento #${r.number}: ${reason}`, { fromReceipt: true });
    } catch (e) {
      if (e instanceof InsufficientBalanceError) {
        throw new StockError(409, `Parte do material deste recebimento já saiu do estoque (${e.info.itemName}, lote ${e.info.lotNumber ?? '—'}). Use devolução ao fornecedor ou ajuste.`);
      }
      throw e;
    }
  }
  for (const pid of r.payableIds) {
    const p = await tx.payable.findFirst({ where: { id: pid, companyId: actor.companyId }, select: { status: true } });
    if (p && p.status !== 'CANCELADO') await cancelPayable(tx, actor.companyId, pid, `Estorno do recebimento de estoque #${r.number}: ${reason}`);
  }
  return tx.stockReceipt.update({
    where: { id: r.id },
    data: { status: 'ESTORNADO', reversedAt: new Date(), reversedById: actor.id, reverseReason: reason, payablePending: false },
  });
}
