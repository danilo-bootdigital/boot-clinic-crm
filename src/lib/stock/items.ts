import type { StockItem } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { isExpired, stockStatus } from '@/lib/stock-caps';
import { StockError } from '@/lib/stock/movements';
import { validateItemRules } from '@/lib/validations/stock';

const num = (d: unknown) => (d == null ? 0 : Number(String(d)));

// Saldo total, situação de reposição e validades por item — calculados na
// leitura (sem cron): "vencido" e "vencendo" derivam de expiresAt × agora.
export async function summarizeItems(tx: TxClient, companyId: string, items: StockItem[], expiryAlertDays: number) {
  const ids = items.map((i) => i.id);
  const balances = await tx.stockBalance.findMany({ where: { companyId, itemId: { in: ids }, quantity: { gt: 0 } } });
  const lots = await tx.stockLot.findMany({ where: { id: { in: Array.from(new Set(balances.map((b) => b.lotId))) } } });
  const lotBy = new Map(lots.map((l) => [l.id, l]));
  const now = new Date();
  const soon = new Date(now.getTime() + expiryAlertDays * 86_400_000);

  return items.map((item) => {
    const mine = balances.filter((b) => b.itemId === item.id);
    let total = 0;
    let expiredQty = 0;
    let expiringQty = 0;
    let nearestExpiry: Date | null = null;
    for (const b of mine) {
      const q = num(b.quantity);
      total += q;
      const lot = lotBy.get(b.lotId);
      if (!lot?.expiresAt) continue;
      if (isExpired(lot.expiresAt, now)) expiredQty += q;
      else {
        if (lot.expiresAt <= soon) expiringQty += q;
        if (!nearestExpiry || lot.expiresAt < nearestExpiry) nearestExpiry = lot.expiresAt;
      }
    }
    return {
      ...item,
      totalQty: total,
      status: stockStatus(total, item.minQty == null ? null : num(item.minQty), item.reorderPoint == null ? null : num(item.reorderPoint)),
      expiredQty,
      expiringQty,
      nearestExpiry,
      stockValue: total * num(item.avgCost),
    };
  });
}

// Normaliza e valida o cadastro mesclado (atual + patch) antes de gravar:
// controlado ⇒ lote + paciente; sem lote ⇒ sem validade; FKs da clínica.
export async function normalizeItem(tx: TxClient, companyId: string, merged: Record<string, any>) {
  if (merged.isControlled) {
    merged.tracksLot = true;
    merged.tracksPatient = true;
  } else {
    merged.controlledList = null;
  }
  if (merged.tracksLot === false) merged.tracksExpiry = false;
  if (merged.multiDose === false) merged.openedShelfLifeHours = null;

  const check = validateItemRules(merged);
  if (!check.success) {
    throw new StockError(400, check.error.issues[0]?.message ?? 'Dados inválidos', { details: check.error.flatten() });
  }
  if (merged.categoryId) {
    const c = await tx.stockCategory.findFirst({ where: { id: merged.categoryId, companyId }, select: { id: true } });
    if (!c) throw new StockError(404, 'Categoria não encontrada');
  }
  if (merged.preferredSupplierId) {
    const s = await tx.supplier.findFirst({ where: { id: merged.preferredSupplierId, companyId, deletedAt: null }, select: { id: true } });
    if (!s) throw new StockError(404, 'Fornecedor não encontrado');
  }
  return merged;
}

// Campos que o PATCH aceita gravar (o resto — avgCost, lastCost — só muda pelo razão).
export const ITEM_WRITABLE = [
  'name', 'categoryId', 'sku', 'barcode', 'kind', 'manufacturer', 'anvisaRegistration', 'baseUnit', 'purchaseUnit',
  'conversionFactor', 'tracksLot', 'tracksExpiry', 'tracksPatient', 'isControlled', 'controlledList', 'controlledNote',
  'storageTemp', 'multiDose', 'openedShelfLifeHours', 'minQty', 'reorderPoint', 'maxQty', 'leadTimeDays',
  'preferredSupplierId', 'salePrice', 'notes', 'isActive',
] as const;

export function pickWritable(src: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of ITEM_WRITABLE) if (k in src) out[k] = src[k];
  return out;
}
