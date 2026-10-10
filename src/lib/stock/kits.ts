import { Prisma } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { StockError } from '@/lib/stock/movements';
import type { KitInput } from '@/lib/validations/stock';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d.toString()));

// Grava o kit (cabeçalho + itens). Um tipo de atendimento dispara no máximo
// um kit ativo (comparação sem maiúsculas/minúsculas).
export async function saveKit(tx: TxClient, companyId: string, id: string | null, input: KitInput) {
  const type = input.appointmentType?.trim() || null;
  if (type && input.isActive !== false) {
    const clash = await tx.procedureKit.findFirst({
      where: { companyId, isActive: true, appointmentType: { equals: type, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) },
      select: { name: true },
    });
    if (clash) throw new StockError(409, `O tipo "${type}" já dispara a ficha "${clash.name}". Um tipo de atendimento tem uma ficha ativa.`);
  }
  const itemIds = Array.from(new Set(input.items.map((i) => i.itemId)));
  if (itemIds.length !== input.items.length) throw new StockError(400, 'Item repetido na ficha. Some as quantidades numa linha só.');
  const found = await tx.stockItem.count({ where: { companyId, id: { in: itemIds }, deletedAt: null } });
  if (found !== itemIds.length) throw new StockError(404, 'Item não encontrado em uma das linhas');

  const data = { name: input.name.trim(), appointmentType: type, consumptionMode: input.consumptionMode ?? null, notes: input.notes || null, ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) };
  const kit = id
    ? await tx.procedureKit.update({ where: { id }, data })
    : await tx.procedureKit.create({ data: { companyId, ...data } });
  if (id) await tx.procedureKitItem.deleteMany({ where: { companyId, kitId: id } });
  if (input.items.length) {
    await tx.procedureKitItem.createMany({
      data: input.items.map((i, order) => ({
        companyId, kitId: kit.id, itemId: i.itemId, quantity: new Prisma.Decimal(i.quantity.toFixed(4)), variable: i.variable, optional: i.optional, order,
      })),
    });
  }
  return kit;
}

// Kits com itens enriquecidos e custo estimado (Σ qtd × custo médio) — o custo
// sai do JSON para quem não tem view_cost.
export async function listKits(tx: TxClient, companyId: string, where: Prisma.ProcedureKitWhereInput = {}) {
  const kits = await tx.procedureKit.findMany({ where: { companyId, ...where }, include: { items: { orderBy: { order: 'asc' } } }, orderBy: { name: 'asc' } });
  const items = await tx.stockItem.findMany({
    where: { companyId, id: { in: Array.from(new Set(kits.flatMap((k) => k.items.map((i) => i.itemId)))) } },
    select: { id: true, name: true, baseUnit: true, avgCost: true, isControlled: true, controlledList: true, isActive: true },
  });
  const by = new Map(items.map((i) => [i.id, i]));
  return kits.map((k) => ({
    ...k,
    estimatedCost: k.items.reduce((s, i) => s + num(i.quantity) * num(by.get(i.itemId)?.avgCost), 0),
    items: k.items.map((i) => {
      const it = by.get(i.itemId);
      return { ...i, name: it?.name ?? '—', baseUnit: it?.baseUnit ?? '', isControlled: !!it?.isControlled, controlledList: it?.controlledList ?? null, itemActive: it?.isActive ?? false };
    }),
  }));
}
