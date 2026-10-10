import { randomUUID } from 'node:crypto';
import { Prisma, type StockItem, type StockLocation, type StockLot, type StockMovementType } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { isStockManager, stockCan } from '@/lib/stock-caps';
import type { MovementInput } from '@/lib/validations/stock';
import {
  avgCostAfterRemoving,
  exitBlockReason,
  needsTemperatureConfirm,
  pickFefoLot,
  round,
  weightedAvgCost,
} from '@/lib/stock/rules';

// ============================================================================
// Motor de movimentações do estoque (§5). Toda operação roda DENTRO de uma
// transação com o tenant fixado (withFinanceTenant): o movimento (razão,
// append-only) e o saldo (cache) mudam juntos ou não mudam.
//
// Saída nunca deixa saldo negativo: UPDATE condicional `quantity >= q`
// (0 linhas = saldo insuficiente → InsufficientBalanceError, a transação
// é desfeita e a rota emite o alerta FORA dela — ver reportRejectedExit).
// ============================================================================

export class StockError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export type RejectedExit = {
  itemId: string;
  itemName: string;
  baseUnit: string;
  locationId: string;
  locationName: string;
  lotId: string | null;
  lotNumber: string | null;
  requested: number;
  available: number;
  type: StockMovementType;
  patientId?: string | null;
};

export class InsufficientBalanceError extends StockError {
  constructor(public info: RejectedExit) {
    super(
      409,
      `Saldo insuficiente de ${info.itemName} em ${info.locationName}${info.lotNumber ? ` (lote ${info.lotNumber})` : ''}: ` +
        `disponível ${fmtQty(info.available)} ${info.baseUnit}, pedido ${fmtQty(info.requested)} ${info.baseUnit}.`,
      { code: 'NO_BALANCE', ...info },
    );
  }
}

export type Actor = { id: string; name: string; companyId: string; role: string };

const fmtQty = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const dec = (n: number, places: number) => new Prisma.Decimal(round(n, places).toFixed(places));
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d.toString()));

// Lê o item travando a linha (FOR UPDATE): serializa entradas/saídas do mesmo
// item, o que mantém o custo médio coerente sob concorrência.
async function lockItem(tx: TxClient, companyId: string, itemId: string): Promise<StockItem> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_items
    WHERE id = ${itemId} AND "companyId" = ${companyId} AND "deletedAt" IS NULL
    FOR UPDATE`;
  if (rows.length === 0) throw new StockError(404, 'Item não encontrado');
  const item = await tx.stockItem.findUniqueOrThrow({ where: { id: itemId } });
  if (!item.isActive) throw new StockError(400, `O item ${item.name} está inativo`);
  return item;
}

async function loadLocation(tx: TxClient, companyId: string, locationId: string): Promise<StockLocation> {
  const loc = await tx.stockLocation.findFirst({ where: { id: locationId, companyId } });
  if (!loc) throw new StockError(404, 'Local não encontrado');
  if (!loc.isActive) throw new StockError(400, `O local ${loc.name} está inativo`);
  return loc;
}

async function loadLot(tx: TxClient, companyId: string, item: StockItem, lotId: string): Promise<StockLot> {
  const lot = await tx.stockLot.findFirst({ where: { id: lotId, companyId, itemId: item.id } });
  if (!lot) throw new StockError(404, 'Lote não encontrado para este item');
  return lot;
}

async function totalQty(tx: TxClient, companyId: string, itemId: string): Promise<number> {
  const agg = await tx.stockBalance.aggregate({ where: { companyId, itemId }, _sum: { quantity: true } });
  return num(agg._sum.quantity);
}

async function incrementBalance(tx: TxClient, companyId: string, itemId: string, lotId: string, locationId: string, q: number) {
  const qd = round(q, 4).toFixed(4);
  await tx.$executeRaw`
    INSERT INTO stock_balances (id, "companyId", "itemId", "lotId", "locationId", quantity, "updatedAt")
    VALUES (${randomUUID()}, ${companyId}, ${itemId}, ${lotId}, ${locationId}, ${qd}::numeric, now())
    ON CONFLICT ("companyId", "itemId", "lotId", "locationId")
    DO UPDATE SET quantity = stock_balances.quantity + EXCLUDED.quantity, "updatedAt" = now()`;
}

// Retorna false quando não há saldo suficiente (nenhuma linha atualizada).
async function decrementBalance(tx: TxClient, companyId: string, itemId: string, lotId: string, locationId: string, q: number) {
  const qd = round(q, 4).toFixed(4);
  const n = await tx.$executeRaw`
    UPDATE stock_balances SET quantity = quantity - ${qd}::numeric, "updatedAt" = now()
    WHERE "companyId" = ${companyId} AND "itemId" = ${itemId} AND "lotId" = ${lotId}
      AND "locationId" = ${locationId} AND quantity >= ${qd}::numeric`;
  return n > 0;
}

async function balanceOf(tx: TxClient, companyId: string, itemId: string, lotId: string, locationId: string) {
  const b = await tx.stockBalance.findUnique({
    where: { companyId_itemId_lotId_locationId: { companyId, itemId, lotId, locationId } },
  });
  return num(b?.quantity);
}

// Snapshot congelado no movimento (§5.13): renomear item/local depois não reescreve o histórico.
function snapshotOf(item: StockItem, lot: StockLot, loc: StockLocation, extra?: Record<string, unknown>) {
  return {
    itemName: item.name,
    baseUnit: item.baseUnit,
    lotNumber: lot.lotNumber,
    expiresAt: lot.expiresAt?.toISOString() ?? null,
    locationName: loc.name,
    ...(item.isControlled ? { controlled: true, controlledList: item.controlledList } : {}),
    ...extra,
  };
}

type MovementData = {
  type: StockMovementType;
  item: StockItem;
  lot: StockLot;
  loc: StockLocation;
  quantity: number; // com sinal
  unitCost: number;
  patientId?: string | null;
  professionalId?: string | null;
  supplierId?: string | null;
  transferId?: string | null;
  receiptId?: string | null;
  reason?: string | null;
  reversalOfId?: string | null;
  snapshotExtra?: Record<string, unknown>;
};

function createMovement(tx: TxClient, actor: Actor, m: MovementData) {
  return tx.stockMovement.create({
    data: {
      companyId: actor.companyId,
      type: m.type,
      itemId: m.item.id,
      lotId: m.lot.id,
      locationId: m.loc.id,
      quantity: dec(m.quantity, 4),
      unitCost: dec(m.unitCost, 6),
      totalCost: dec(Math.abs(m.quantity) * m.unitCost, 2),
      patientId: m.patientId ?? null,
      professionalId: m.professionalId ?? null,
      supplierId: m.supplierId ?? null,
      transferId: m.transferId ?? null,
      receiptId: m.receiptId ?? null,
      reason: m.reason ?? null,
      reversalOfId: m.reversalOfId ?? null,
      snapshot: snapshotOf(m.item, m.lot, m.loc, m.snapshotExtra),
      createdById: actor.id,
    },
  });
}

// Saída de um lote num local, com as travas de lote/validade e saldo.
async function exitFrom(
  tx: TxClient,
  actor: Actor,
  args: { type: StockMovementType; item: StockItem; loc: StockLocation; lotId?: string | null; qty: number } &
    Omit<MovementData, 'type' | 'item' | 'lot' | 'loc' | 'quantity' | 'unitCost'>,
) {
  const { item, loc, qty } = args;
  let lot: StockLot;
  if (args.lotId) {
    lot = await loadLot(tx, actor.companyId, item, args.lotId);
  } else {
    // FEFO no local: menor validade entre os lotes liberados com saldo suficiente.
    const balances = await tx.stockBalance.findMany({
      where: { companyId: actor.companyId, itemId: item.id, locationId: loc.id, quantity: { gt: 0 } },
    });
    const lots = await tx.stockLot.findMany({ where: { id: { in: balances.map((b) => b.lotId) } } });
    const byId = new Map(lots.map((l) => [l.id, l]));
    const pick = pickFefoLot(
      balances.filter((b) => byId.has(b.lotId)).map((b) => ({ lotId: b.lotId, quantity: num(b.quantity), lot: byId.get(b.lotId)! })),
      qty,
    );
    if (!pick) {
      const available = balances.reduce((s, b) => s + num(b.quantity), 0);
      throw new InsufficientBalanceError({
        itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, locationId: loc.id, locationName: loc.name,
        lotId: null, lotNumber: null, requested: qty, available, type: args.type, patientId: args.patientId,
      });
    }
    lot = byId.get(pick.lotId)!;
  }

  const blocked = exitBlockReason(args.type, lot);
  if (blocked) throw new StockError(409, blocked, { code: 'LOT_BLOCKED' });

  const ok = await decrementBalance(tx, actor.companyId, item.id, lot.id, loc.id, qty);
  if (!ok) {
    throw new InsufficientBalanceError({
      itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, locationId: loc.id, locationName: loc.name,
      lotId: lot.id, lotNumber: lot.lotNumber, requested: qty,
      available: await balanceOf(tx, actor.companyId, item.id, lot.id, loc.id), type: args.type, patientId: args.patientId,
    });
  }

  return createMovement(tx, actor, { ...args, lot, quantity: -qty, unitCost: num(item.avgCost) });
}

// Lote de uma entrada: item sem controle de lote usa o lote implícito "PADRAO".
async function resolveEntryLot(
  tx: TxClient,
  actor: Actor,
  item: StockItem,
  args: { lotNumber?: string | null; expiresAt?: string | null; manufacturedAt?: string | null; supplierId?: string | null; unitCost: number },
) {
  const lotNumber = item.tracksLot ? (args.lotNumber || '').trim() : 'PADRAO';
  if (!lotNumber) throw new StockError(400, `Informe o lote de ${item.name}`);
  const expiresAt = item.tracksExpiry && args.expiresAt ? new Date(args.expiresAt) : null;

  const existing = await tx.stockLot.findUnique({
    where: { companyId_itemId_lotNumber: { companyId: actor.companyId, itemId: item.id, lotNumber } },
  });
  if (existing) {
    const sameDay = (a: Date | null, b: Date | null) => (a ? a.toISOString().slice(0, 10) : null) === (b ? b.toISOString().slice(0, 10) : null);
    if (expiresAt && existing.expiresAt && !sameDay(existing.expiresAt, expiresAt)) {
      throw new StockError(409, `O lote ${lotNumber} já está cadastrado com validade ${existing.expiresAt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}. Confira o lote ou a validade.`);
    }
    return existing;
  }
  if (item.tracksExpiry && !expiresAt) throw new StockError(400, `Informe a validade do lote ${lotNumber}`);
  return tx.stockLot.create({
    data: {
      companyId: actor.companyId,
      itemId: item.id,
      lotNumber,
      expiresAt,
      manufacturedAt: args.manufacturedAt ? new Date(args.manufacturedAt) : null,
      supplierId: args.supplierId ?? null,
      unitCost: dec(args.unitCost, 6),
    },
  });
}

async function requirePatient(tx: TxClient, companyId: string, patientId: string) {
  const p = await tx.patient.findFirst({ where: { id: patientId, companyId, deletedAt: null }, select: { id: true, name: true } });
  if (!p) throw new StockError(404, 'Paciente não encontrado');
  return p;
}

async function requireProfessional(tx: TxClient, companyId: string, professionalId: string) {
  const p = await tx.professional.findFirst({ where: { id: professionalId, companyId }, select: { id: true, name: true } });
  if (!p) throw new StockError(404, 'Profissional não encontrado');
  return p;
}

// Regras de controlados (§5.11) comuns a todas as operações.
function assertControlledAccess(actor: Actor, item: StockItem, opts: { managerOnly?: boolean } = {}) {
  if (!item.isControlled) return;
  if (!stockCan(actor.role, 'controlled')) {
    throw new StockError(403, `${item.name} é controlado (lista ${item.controlledList}). Você não tem permissão para movimentar controlados.`);
  }
  if (opts.managerOnly && !isStockManager(actor.role)) {
    throw new StockError(403, `${item.name} é controlado: ajuste, perda e estorno só pela gestão.`);
  }
}

function assertControlledStorage(item: StockItem, loc: StockLocation) {
  if (item.isControlled && !loc.controlledStorage) {
    throw new StockError(400, `${item.name} é controlado e só pode ficar em local de guarda de controlados. ${loc.name} não é.`);
  }
}

function assertTemperature(item: StockItem, loc: StockLocation, confirmed?: boolean) {
  if (needsTemperatureConfirm(item.storageTemp, loc.storageTemp) && !confirmed) {
    throw new StockError(409, `${item.name} é ${item.storageTemp.toLowerCase()} e ${loc.name} é ${loc.storageTemp.toLowerCase()}. Confirme para continuar.`, { code: 'TEMPERATURE_CONFIRM' });
  }
}

// Entrada (qualquer tipo ENTRADA_*): resolve/cria o lote, soma o saldo e
// recalcula o custo médio ponderado. O item já deve estar travado (lockItem).
// Usada pelas entradas avulsas (Fase 1) e pelo Recebimento (Fase 2).
export async function applyEntry(
  tx: TxClient,
  actor: Actor,
  args: {
    item: StockItem; loc: StockLocation; type: StockMovementType; qty: number; unitCost: number; updateLastCost: boolean
    lotNumber?: string | null; expiresAt?: string | null; manufacturedAt?: string | null
    supplierId?: string | null; receiptId?: string | null; reason?: string | null; confirmTemperature?: boolean
  },
) {
  const { item, loc, qty, unitCost } = args;
  assertControlledAccess(actor, item);
  assertControlledStorage(item, loc);
  assertTemperature(item, loc, args.confirmTemperature);

  const lot = await resolveEntryLot(tx, actor, item, { ...args, unitCost });
  const before = await totalQty(tx, actor.companyId, item.id);
  const current = await tx.stockItem.findUniqueOrThrow({ where: { id: item.id }, select: { avgCost: true } });
  await incrementBalance(tx, actor.companyId, item.id, lot.id, loc.id, qty);
  await tx.stockItem.update({
    where: { id: item.id },
    data: {
      avgCost: dec(weightedAvgCost(before, num(current.avgCost), qty, unitCost), 6),
      ...(args.updateLastCost ? { lastCost: dec(unitCost, 6) } : {}),
    },
  });
  return createMovement(tx, actor, {
    type: args.type, item, lot, loc, quantity: qty, unitCost,
    supplierId: args.supplierId, receiptId: args.receiptId, reason: args.reason,
  });
}

export { lockItem, loadLocation };

// ---------------------------------------------------------------------------
// Operações da Fase 1
// ---------------------------------------------------------------------------

export async function postMovement(tx: TxClient, actor: Actor, input: MovementInput) {
  const item = await lockItem(tx, actor.companyId, input.itemId);

  switch (input.operation) {
    case 'ENTRADA': {
      const loc = await loadLocation(tx, actor.companyId, input.locationId);
      const factor = input.unit === 'purchase' ? num(item.conversionFactor) : 1;
      // Custo por unidade base. Sem custo informado: devolução e avulsa entram
      // pelo custo médio (não distorcem a média); bonificação entra a custo zero.
      const informed = input.unitCost != null;
      const unitCost = informed
        ? input.unitCost! / factor
        : input.type === 'ENTRADA_BONIFICACAO' ? 0 : num(item.avgCost);
      return [await applyEntry(tx, actor, {
        item, loc, type: input.type, qty: round(input.quantity * factor, 4), unitCost,
        updateLastCost: informed && input.type !== 'ENTRADA_DEVOLUCAO',
        lotNumber: input.lotNumber, expiresAt: input.expiresAt, manufacturedAt: input.manufacturedAt,
        supplierId: input.supplierId, reason: input.reason, confirmTemperature: input.confirmTemperature,
      })];
    }

    case 'CONSUMO': {
      assertControlledAccess(actor, item);
      const loc = await loadLocation(tx, actor.companyId, input.locationId);
      const needsPatient = item.tracksPatient || item.isControlled;
      if (needsPatient && !input.patientId) throw new StockError(400, `${item.name} só sai com o paciente informado`);
      if (item.isControlled) {
        if (!input.professionalId) throw new StockError(400, `${item.name} é controlado: informe o profissional responsável`);
        if (!input.reason || input.reason.trim().length < 3) throw new StockError(400, `${item.name} é controlado: a justificativa é obrigatória`);
        if (item.controlledNote && !input.ackControlledNote) throw new StockError(400, `Confirme que leu a observação de ${item.name}`);
      }
      const patient = input.patientId ? await requirePatient(tx, actor.companyId, input.patientId) : null;
      const prof = input.professionalId ? await requireProfessional(tx, actor.companyId, input.professionalId) : null;
      return [await exitFrom(tx, actor, {
        type: 'CONSUMO_INTERNO', item, loc, lotId: input.lotId, qty: input.quantity,
        patientId: patient?.id, professionalId: prof?.id, reason: input.reason,
        snapshotExtra: { patientName: patient?.name ?? null, professionalName: prof?.name ?? null },
      })];
    }

    case 'PERDA': {
      assertControlledAccess(actor, item, { managerOnly: true });
      const loc = await loadLocation(tx, actor.companyId, input.locationId);
      const reason = [input.lossReason, input.reason?.trim()].filter(Boolean).join(': ');
      return [await exitFrom(tx, actor, {
        type: 'PERDA', item, loc, lotId: input.lotId, qty: input.quantity, reason,
        snapshotExtra: { lossReason: input.lossReason },
      })];
    }

    case 'AJUSTE': {
      assertControlledAccess(actor, item, { managerOnly: true });
      const loc = await loadLocation(tx, actor.companyId, input.locationId);
      if (input.direction === 'OUT') {
        return [await exitFrom(tx, actor, { type: 'AJUSTE_MANUAL', item, loc, lotId: input.lotId, qty: input.quantity, reason: input.reason })];
      }
      assertControlledStorage(item, loc);
      const lot = await loadLot(tx, actor.companyId, item, input.lotId);
      // Sobra entra pelo custo médio vigente: não altera a média.
      await incrementBalance(tx, actor.companyId, item.id, lot.id, loc.id, input.quantity);
      return [await createMovement(tx, actor, {
        type: 'AJUSTE_MANUAL', item, lot, loc, quantity: input.quantity, unitCost: num(item.avgCost), reason: input.reason,
      })];
    }

    case 'TRANSFERENCIA': {
      assertControlledAccess(actor, item);
      if (input.fromLocationId === input.toLocationId) throw new StockError(400, 'Origem e destino são o mesmo local');
      const from = await loadLocation(tx, actor.companyId, input.fromLocationId);
      const to = await loadLocation(tx, actor.companyId, input.toLocationId);
      assertControlledStorage(item, to);
      assertTemperature(item, to, input.confirmTemperature);
      const transferId = randomUUID();
      const out = await exitFrom(tx, actor, {
        type: 'TRANSFERENCIA_SAIDA', item, loc: from, lotId: input.lotId, qty: input.quantity,
        transferId, reason: input.reason, snapshotExtra: { toLocationName: to.name },
      });
      const lot = await loadLot(tx, actor.companyId, item, out.lotId);
      await incrementBalance(tx, actor.companyId, item.id, lot.id, to.id, input.quantity);
      const inn = await createMovement(tx, actor, {
        type: 'TRANSFERENCIA_ENTRADA', item, lot, loc: to, quantity: input.quantity, unitCost: num(item.avgCost),
        transferId, reason: input.reason, snapshotExtra: { fromLocationName: from.name },
      });
      return [out, inn];
    }
  }
}

// Estorno (§5.1): nunca se edita o razão — lança o inverso apontando a
// original. Transferência estorna as duas pernas juntas.
export async function reverseMovement(tx: TxClient, actor: Actor, movementId: string, reason: string, opts: { fromReceipt?: boolean } = {}) {
  const original = await tx.stockMovement.findFirst({ where: { id: movementId, companyId: actor.companyId } });
  if (!original) throw new StockError(404, 'Movimentação não encontrada');
  // Entrada de compra é desfeita pelo recebimento inteiro (que também cuida da conta a pagar).
  if (original.receiptId && !opts.fromReceipt) {
    throw new StockError(409, 'Esta entrada veio de um recebimento. Estorne pelo recebimento, que também trata a conta a pagar.');
  }
  if (original.type === 'ESTORNO') throw new StockError(400, 'Um estorno não pode ser estornado — lance a movimentação de novo');
  if (original.reversedAt) throw new StockError(409, 'Esta movimentação já foi estornada');

  const item = await lockItem(tx, actor.companyId, original.itemId);
  assertControlledAccess(actor, item, { managerOnly: true });

  const legs = original.transferId
    ? await tx.stockMovement.findMany({ where: { companyId: actor.companyId, transferId: original.transferId }, orderBy: { quantity: 'desc' } })
    : [original];

  // Marca as originais como estornadas primeiro (condicional: dois estornos
  // simultâneos da mesma linha → só um passa).
  const marked = await tx.stockMovement.updateMany({
    where: { id: { in: legs.map((l) => l.id) }, companyId: actor.companyId, reversedAt: null },
    data: { reversedAt: new Date() },
  });
  if (marked.count !== legs.length) throw new StockError(409, 'Esta movimentação já foi estornada');

  const isTransfer = !!original.transferId;
  const created = [];
  // Pernas de entrada (+) primeiro: o estorno delas é uma SAÍDA e pode falhar por saldo.
  for (const leg of legs) {
    const q = num(leg.quantity);
    const cost = num(leg.unitCost);
    const lot = await loadLot(tx, actor.companyId, item, leg.lotId);
    const loc = await tx.stockLocation.findFirstOrThrow({ where: { id: leg.locationId, companyId: actor.companyId } });
    const before = await totalQty(tx, actor.companyId, item.id);
    const current = await tx.stockItem.findUniqueOrThrow({ where: { id: item.id }, select: { avgCost: true } });

    if (q > 0) {
      const ok = await decrementBalance(tx, actor.companyId, item.id, lot.id, loc.id, q);
      if (!ok) {
        throw new InsufficientBalanceError({
          itemId: item.id, itemName: item.name, baseUnit: item.baseUnit, locationId: loc.id, locationName: loc.name,
          lotId: lot.id, lotNumber: lot.lotNumber, requested: q,
          available: await balanceOf(tx, actor.companyId, item.id, lot.id, loc.id), type: 'ESTORNO',
        });
      }
      if (!isTransfer) {
        await tx.stockItem.update({ where: { id: item.id }, data: { avgCost: dec(avgCostAfterRemoving(before, num(current.avgCost), q, cost), 6) } });
      }
    } else {
      await incrementBalance(tx, actor.companyId, item.id, lot.id, loc.id, -q);
      if (!isTransfer) {
        await tx.stockItem.update({ where: { id: item.id }, data: { avgCost: dec(weightedAvgCost(before, num(current.avgCost), -q, cost), 6) } });
      }
    }

    created.push(await createMovement(tx, actor, {
      type: 'ESTORNO', item, lot, loc, quantity: -q, unitCost: cost,
      patientId: leg.patientId, professionalId: leg.professionalId, transferId: leg.transferId,
      reason, reversalOfId: leg.id, snapshotExtra: { reversedType: leg.type },
    }));
  }
  return created;
}
