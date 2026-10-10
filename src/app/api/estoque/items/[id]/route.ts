import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { UpdateItemSchema } from '@/lib/validations/stock';
import { normalizeItem, pickWritable, summarizeItems } from '@/lib/stock/items';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

type Ctx = { params: { id: string } };
const num = (d: unknown) => (d == null ? 0 : Number(String(d)));

// GET /api/estoque/items/:id — item + saldos por local×lote + lotes.
export async function GET(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const canViewCost = stockCan(dbUser!.role, 'view_cost');
    const data = await withFinanceTenant(companyId, async (tx) => {
      const item = await tx.stockItem.findFirst({ where: { id: params.id, companyId, deletedAt: null } });
      if (!item) throw new StockError(404, 'Item não encontrado');
      const settings = await tx.stockSettings.findUnique({ where: { companyId } });
      const [summary] = await summarizeItems(tx, companyId, [item], settings?.expiryAlertDays ?? 60);
      const [balances, lots, category, supplier] = await Promise.all([
        tx.stockBalance.findMany({ where: { companyId, itemId: item.id, quantity: { gt: 0 } } }),
        tx.stockLot.findMany({ where: { companyId, itemId: item.id }, orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }] }),
        item.categoryId ? tx.stockCategory.findFirst({ where: { id: item.categoryId, companyId }, select: { name: true } }) : null,
        item.preferredSupplierId ? tx.supplier.findFirst({ where: { id: item.preferredSupplierId, companyId }, select: { name: true } }) : null,
      ]);
      const locs = await tx.stockLocation.findMany({ where: { companyId, id: { in: balances.map((b) => b.locationId) } } });
      const locBy = new Map(locs.map((l) => [l.id, l]));
      const lotBy = new Map(lots.map((l) => [l.id, l]));
      // Últimas compras (recebimentos confirmados): preço é valor — só p/ quem vê custo.
      let purchases: unknown[] = [];
      if (canViewCost) {
        const lines = await tx.stockReceiptItem.findMany({
          where: { companyId, itemId: item.id, movementId: { not: null }, receipt: { status: 'CONFIRMADO' } },
          include: { receipt: { select: { id: true, number: true, receivedAt: true, supplierId: true, invoiceNumber: true } } },
          orderBy: { receipt: { receivedAt: 'desc' } },
          take: 10,
        });
        const sups = await tx.supplier.findMany({
          where: { companyId, id: { in: lines.map((l) => l.receipt.supplierId).filter((x): x is string => !!x) } },
          select: { id: true, name: true },
        });
        const supBy = new Map(sups.map((s) => [s.id, s.name]));
        purchases = lines.map((l) => ({
          receiptId: l.receipt.id, number: l.receipt.number, receivedAt: l.receipt.receivedAt, invoiceNumber: l.receipt.invoiceNumber,
          supplierName: l.receipt.supplierId ? supBy.get(l.receipt.supplierId) ?? null : null,
          qtyPurchase: l.qtyPurchase, unitPrice: l.unitPrice, unitCost: l.unitCost,
        }));
      }
      const lotQty = new Map<string, number>();
      for (const b of balances) lotQty.set(b.lotId, (lotQty.get(b.lotId) ?? 0) + num(b.quantity));
      return {
        item: { ...summary, categoryName: category?.name ?? null, preferredSupplierName: supplier?.name ?? null },
        balances: balances
          .map((b) => {
            const lot = lotBy.get(b.lotId)!;
            const loc = locBy.get(b.locationId);
            return {
              id: b.id,
              quantity: num(b.quantity),
              locationId: b.locationId,
              locationName: loc?.name ?? '—',
              locationTemp: loc?.storageTemp ?? null,
              lotId: b.lotId,
              lotNumber: lot?.lotNumber ?? '—',
              expiresAt: lot?.expiresAt ?? null,
              lotStatus: lot?.status ?? null,
            };
          })
          .sort((a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity)),
        lots: lots.map((l) => ({ ...l, quantity: lotQty.get(l.id) ?? 0 })),
        purchases,
      };
    });
    return NextResponse.json(stockJson(data, canViewCost));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'item GET');
  }
}

// PATCH /api/estoque/items/:id — edita cadastro (custo só muda pelo razão).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = UpdateItemSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const companyId = dbUser!.companyId;
    const [before, after] = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockItem.findFirst({ where: { id: params.id, companyId, deletedAt: null } });
      if (!b) throw new StockError(404, 'Item não encontrado');
      const patch = pickWritable(parsed.data);
      const current = pickWritable(stockJson(b, true));
      const merged = await normalizeItem(tx, companyId, { ...current, ...patch });

      // Unidade base e fator definem o significado de todo saldo já lançado.
      const moved = await tx.stockMovement.count({ where: { companyId, itemId: b.id } });
      if (moved > 0 && (merged.baseUnit !== b.baseUnit || merged.tracksLot !== b.tracksLot)) {
        throw new StockError(409, 'O item já tem movimentações: unidade base e controle de lote não podem mudar. Cadastre um item novo.');
      }
      // Virar controlado com saldo fora da guarda de controlados deixaria o item em local proibido.
      if (merged.isControlled && !b.isControlled) {
        const held = await tx.stockBalance.findMany({ where: { companyId, itemId: b.id, quantity: { gt: 0 } }, select: { locationId: true } });
        const bad = await tx.stockLocation.count({ where: { companyId, id: { in: held.map((h) => h.locationId) }, controlledStorage: false } });
        if (bad > 0) throw new StockError(409, 'Há saldo deste item fora de local de guarda de controlados. Transfira antes de marcá-lo como controlado.');
      }
      if (merged.isActive === false && b.isActive) {
        const agg = await tx.stockBalance.aggregate({ where: { companyId, itemId: b.id }, _sum: { quantity: true } });
        if (num(agg._sum.quantity) > 0) throw new StockError(409, 'O item ainda tem saldo. Zere o saldo (perda/ajuste) antes de desativar.');
      }
      return [b, await tx.stockItem.update({ where: { id: b.id }, data: merged as any })];
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'STOCK_ITEM', entityId: after.id, oldValues: before, newValues: after, request });
    return NextResponse.json(stockJson(after, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'item PATCH');
  }
}

// DELETE /api/estoque/items/:id — exclusão lógica, só sem saldo (o razão é preservado).
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const removed = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockItem.findFirst({ where: { id: params.id, companyId, deletedAt: null } });
      if (!b) throw new StockError(404, 'Item não encontrado');
      const agg = await tx.stockBalance.aggregate({ where: { companyId, itemId: b.id }, _sum: { quantity: true } });
      if (num(agg._sum.quantity) > 0) throw new StockError(409, 'O item ainda tem saldo. Zere o saldo antes de excluir.');
      // Libera o nome para um cadastro novo sem perder o histórico.
      return tx.stockItem.update({ where: { id: b.id }, data: { deletedAt: new Date(), isActive: false, name: `${b.name} (excluído ${b.id.slice(-6)})` } });
    });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'STOCK_ITEM', entityId: removed.id, oldValues: { name: removed.name }, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'item DELETE');
  }
}
