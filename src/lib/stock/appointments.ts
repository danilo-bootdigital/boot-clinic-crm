import { Prisma, type StockConsumptionMode } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { isStockManager, stockCan } from '@/lib/stock-caps';
import { pickFefoLot } from '@/lib/stock/rules';
import {
  consumeForAppointment, reverseMovement, InsufficientBalanceError, StockError,
  type Actor, type AppointmentRef, type RejectedExit,
} from '@/lib/stock/movements';
import type { UsageConfirmInput } from '@/lib/validations/stock';

// ============================================================================
// Baixa de materiais no atendimento (Fase 3, §5.14). Dois modos, padrão da
// clínica sobrescrevível por kit: CONFIRMADA (o painel abre pré-preenchido e
// nada sai até alguém conferir) e AUTOMATICA (marcar "realizado" baixa os itens
// fixos e não opcionais do kit). Atendimento NUNCA trava por estoque: cada linha
// roda na própria transação e o que falha vira pendência + alerta.
//
// `runTx` abre uma transação com o tenant fixado (withFinanceTenant em produção;
// nos testes de integração, o banco local com role sem bypass de RLS).
// ============================================================================

export type RunTx = <T>(fn: (tx: TxClient) => Promise<T>) => Promise<T>;

export type LineResult =
  | { itemId: string; ok: true; movementId: string }
  | { itemId: string; ok: false; error: string; rejected?: RejectedExit };

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d.toString()));

export async function loadAppointment(tx: TxClient, companyId: string, appointmentId: string) {
  const a = await tx.appointment.findFirst({ where: { id: appointmentId, companyId, deletedAt: null } });
  if (!a) throw new StockError(404, 'Agendamento não encontrado');
  const [patient, professional] = await Promise.all([
    tx.patient.findFirst({ where: { id: a.patientId, companyId }, select: { name: true } }),
    tx.professional.findFirst({ where: { id: a.professionalId, companyId }, select: { name: true, userId: true } }),
  ]);
  return {
    ...a,
    patientName: patient?.name ?? null,
    professionalName: professional?.name ?? null,
    professionalUserId: professional?.userId ?? null,
  };
}
type LoadedAppointment = Awaited<ReturnType<typeof loadAppointment>>;

// Médico dá baixa só nos próprios atendimentos; recepção e gestão em qualquer um (§7).
export function canActOnAppointment(actor: Actor, appt: { professionalUserId: string | null }) {
  if (!stockCan(actor.role, 'consume')) return false;
  if (actor.role === 'DOCTOR') return appt.professionalUserId === actor.id;
  return true;
}

export function assertCanAct(actor: Actor, appt: LoadedAppointment) {
  if (!canActOnAppointment(actor, appt)) {
    throw new StockError(403, actor.role === 'DOCTOR' ? 'Você só dá baixa nos seus próprios atendimentos' : 'Sem permissão para dar baixa de materiais');
  }
}

export async function findKitForType(tx: TxClient, companyId: string, type: string | null | undefined) {
  if (!type?.trim()) return null;
  return tx.procedureKit.findFirst({
    where: { companyId, isActive: true, appointmentType: { equals: type.trim(), mode: 'insensitive' } },
    include: { items: { orderBy: { order: 'asc' } } },
  });
}

// Local do atendimento: o local ligado à sala; senão o padrão; senão o primeiro ativo.
export async function locationForAppointment(tx: TxClient, companyId: string, roomId: string | null) {
  if (roomId) {
    const byRoom = await tx.stockLocation.findFirst({ where: { companyId, roomId, isActive: true } });
    if (byRoom) return byRoom;
  }
  return (
    (await tx.stockLocation.findFirst({ where: { companyId, isActive: true, isDefault: true } })) ??
    (await tx.stockLocation.findFirst({ where: { companyId, isActive: true }, orderBy: { createdAt: 'asc' } }))
  );
}

async function resolveMode(tx: TxClient, companyId: string, kit: { consumptionMode: StockConsumptionMode | null } | null) {
  if (kit?.consumptionMode) return kit.consumptionMode;
  const s = await tx.stockSettings.findUnique({ where: { companyId } });
  return s?.defaultConsumptionMode ?? 'CONFIRMADA';
}

const toRef = (a: LoadedAppointment): AppointmentRef => ({
  id: a.id, patientId: a.patientId, professionalId: a.professionalId, type: a.type,
  patientName: a.patientName, professionalName: a.professionalName,
});

// Registro de aplicação no prontuário (§6 Prontuário) p/ itens rastreados por
// paciente: produto, lote, validade, quantidade e região.
async function recordApplication(
  tx: TxClient, actor: Actor, appt: LoadedAppointment, movementIds: string[], mode: 'AUTOMATICA' | 'CONFIRMADA',
) {
  if (movementIds.length === 0) return null;
  const mvs = await tx.stockMovement.findMany({ where: { companyId: actor.companyId, id: { in: movementIds } }, orderBy: { createdAt: 'asc' } });
  const lines = mvs.map((m) => {
    const s = (m.snapshot ?? {}) as Record<string, any>;
    const val = s.expiresAt ? ` (val. ${new Date(s.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})` : '';
    const ctrl = s.controlled ? ` · CONTROLADO lista ${s.controlledList}` : '';
    return `• ${s.itemName} — lote ${s.lotNumber}${val} — ${Math.abs(num(m.quantity)).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${s.baseUnit}${s.region ? ` · região: ${s.region}` : ''}${ctrl}`;
  });
  const record = await tx.medicalRecord.create({
    data: {
      companyId: actor.companyId,
      patientId: appt.patientId,
      type: 'PROCEDURE',
      title: `Produtos aplicados — ${appt.type || 'atendimento'}`,
      content: `${lines.join('\n')}\n\nRegistrado pela baixa de estoque (${mode === 'AUTOMATICA' ? 'automática pelo kit' : 'conferida'}) por ${actor.name}.`,
      professionalId: appt.professionalId,
      appointmentId: appt.id,
      createdById: actor.id,
    },
  });
  await tx.stockMovement.updateMany({ where: { companyId: actor.companyId, id: { in: movementIds } }, data: { medicalRecordId: record.id } });
  return record;
}

// Saldo líquido já baixado por item neste atendimento (consumos − estornos).
async function consumedByItem(tx: TxClient, companyId: string, appointmentId: string) {
  const mvs = await tx.stockMovement.findMany({
    where: { companyId, appointmentId, type: { in: ['CONSUMO_ATENDIMENTO', 'ESTORNO'] } },
    select: { itemId: true, quantity: true },
  });
  const by = new Map<string, number>();
  for (const m of mvs) by.set(m.itemId, (by.get(m.itemId) ?? 0) - num(m.quantity)); // consumo é negativo
  return by;
}

// ---------------------------------------------------------------------------
// Painel "Materiais utilizados"
// ---------------------------------------------------------------------------

export async function getUsagePanel(tx: TxClient, actor: Actor, appointmentId: string, kitIdsOverride?: string[]) {
  const companyId = actor.companyId;
  const appt = await loadAppointment(tx, companyId, appointmentId);
  const usage = await tx.stockAppointmentUsage.findUnique({ where: { companyId_appointmentId: { companyId, appointmentId } } });
  const suggested = await findKitForType(tx, companyId, appt.type);
  const kitIds = kitIdsOverride ?? (usage?.kitIds.length ? usage.kitIds : suggested ? [suggested.id] : []);
  const kits = kitIds.length
    ? await tx.procedureKit.findMany({ where: { companyId, id: { in: kitIds } }, include: { items: { orderBy: { order: 'asc' } } } })
    : [];
  const allKits = await tx.procedureKit.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, appointmentType: true } });
  const mode = await resolveMode(tx, companyId, suggested);
  const location = await locationForAppointment(tx, companyId, appt.roomId);

  // Proposta = itens dos kits escolhidos − o que já foi baixado neste atendimento.
  const consumed = await consumedByItem(tx, companyId, appointmentId);
  const wanted = new Map<string, { quantity: number; variable: boolean; optional: boolean; kitId: string }>();
  for (const k of kits) {
    for (const ki of k.items) {
      const cur = wanted.get(ki.itemId);
      wanted.set(ki.itemId, {
        quantity: (cur?.quantity ?? 0) + num(ki.quantity),
        variable: (cur?.variable ?? false) || ki.variable,
        optional: (cur?.optional ?? true) && ki.optional,
        kitId: cur?.kitId ?? k.id,
      });
    }
  }
  const itemIds = Array.from(new Set([...Array.from(wanted.keys()), ...Array.from(consumed.keys())]));
  const items = await tx.stockItem.findMany({ where: { companyId, id: { in: itemIds } } });
  const itemBy = new Map(items.map((i) => [i.id, i]));

  // Lote sugerido (FEFO) no local do atendimento.
  const balances = location
    ? await tx.stockBalance.findMany({ where: { companyId, locationId: location.id, itemId: { in: itemIds }, quantity: { gt: 0 } } })
    : [];
  const lots = await tx.stockLot.findMany({ where: { companyId, id: { in: balances.map((b) => b.lotId) } } });
  const lotBy = new Map(lots.map((l) => [l.id, l]));

  const proposed = Array.from(wanted.entries()).map(([itemId, w]) => {
    const item = itemBy.get(itemId)!;
    const remaining = Math.max(0, w.quantity - (consumed.get(itemId) ?? 0));
    const candidates = balances
      .filter((b) => b.itemId === itemId && lotBy.has(b.lotId))
      .map((b) => ({ lotId: b.lotId, quantity: num(b.quantity), lot: lotBy.get(b.lotId)! }));
    const fefo = pickFefoLot(candidates, Math.max(remaining, 0.0001));
    return {
      itemId, kitId: w.kitId, quantity: remaining, variable: w.variable, optional: w.optional,
      name: item?.name ?? '—', baseUnit: item?.baseUnit ?? '', isControlled: !!item?.isControlled,
      controlledList: item?.controlledList ?? null, controlledNote: item?.controlledNote ?? null, tracksPatient: !!item?.tracksPatient,
      availableHere: candidates.reduce((s, c) => s + c.quantity, 0),
      suggestedLot: fefo ? { lotId: fefo.lotId, lotNumber: fefo.lot.lotNumber, expiresAt: fefo.lot.expiresAt, quantity: fefo.quantity } : null,
      lots: candidates.map((c) => ({ lotId: c.lotId, lotNumber: c.lot.lotNumber, expiresAt: c.lot.expiresAt, status: c.lot.status, quantity: c.quantity })),
      alreadyConsumed: consumed.get(itemId) ?? 0,
    };
  });

  const movements = await tx.stockMovement.findMany({
    where: { companyId, appointmentId, type: 'CONSUMO_ATENDIMENTO' },
    orderBy: { createdAt: 'asc' },
  });

  return {
    appointment: {
      id: appt.id, type: appt.type, status: appt.status, patientId: appt.patientId, patientName: appt.patientName,
      professionalName: appt.professionalName, roomId: appt.roomId, attendedAt: appt.attendedAt,
    },
    canAct: canActOnAppointment(actor, appt),
    canReverseControlled: isStockManager(actor.role),
    mode,
    usage,
    suggestedKitId: suggested?.id ?? null,
    kitIds,
    kits: allKits,
    location: location ? { id: location.id, name: location.name } : null,
    proposed,
    movements,
  };
}

// Conferência do painel. Cada linha é uma transação: falta de saldo numa linha
// não desfaz as outras nem trava o atendimento — vira pendência + alerta.
export async function confirmUsage(runTx: RunTx, actor: Actor, appointmentId: string, input: UsageConfirmInput) {
  const companyId = actor.companyId;
  const appt = await runTx((tx) => loadAppointment(tx, companyId, appointmentId));
  assertCanAct(actor, appt);
  if (appt.status !== 'ATTENDED') throw new StockError(409, 'A baixa de materiais é feita depois de marcar o atendimento como realizado');

  // "Quem confirmou primeiro fecha o painel": reivindica a conferência de forma
  // atômica (UPDATE condicional). O segundo recebe 409 e só pode corrigir.
  if (!input.add) {
    const claimed = await runTx(async (tx) => {
      const kit = await findKitForType(tx, companyId, appt.type);
      const mode = await resolveMode(tx, companyId, kit);
      await tx.stockAppointmentUsage.upsert({
        where: { companyId_appointmentId: { companyId, appointmentId } },
        update: {},
        create: { companyId, appointmentId, mode, status: 'PENDENTE', kitIds: input.kitIds },
      });
      const r = await tx.stockAppointmentUsage.updateMany({
        where: { companyId, appointmentId, status: { not: 'CONFIRMADO' } },
        data: { status: 'CONFIRMADO', confirmedById: actor.id, confirmedAt: new Date(), kitIds: input.kitIds },
      });
      return r.count > 0;
    });
    if (!claimed) throw new StockError(409, 'Os materiais deste atendimento já foram conferidos. Para mudar, estorne a linha e acrescente o correto.');
  }

  const results: LineResult[] = [];
  const recorded: string[] = [];
  for (const line of input.lines) {
    try {
      const { movement, item } = await runTx((tx) => consumeForAppointment(tx, actor, {
        appointment: toRef(appt), itemId: line.itemId, locationId: input.locationId, lotId: line.lotId, qty: line.quantity,
        mode: 'CONFIRMADA', kitId: line.kitId, region: input.region, reason: line.reason, ackControlledNote: line.ackControlledNote,
      }));
      results.push({ itemId: line.itemId, ok: true, movementId: movement.id });
      if (item.tracksPatient || item.isControlled) recorded.push(movement.id);
    } catch (e) {
      if (e instanceof InsufficientBalanceError) results.push({ itemId: line.itemId, ok: false, error: e.message, rejected: e.info });
      else if (e instanceof StockError) results.push({ itemId: line.itemId, ok: false, error: e.message });
      else throw e;
    }
  }

  if (recorded.length > 0) await runTx((tx) => recordApplication(tx, actor, appt, recorded, 'CONFIRMADA'));
  // Linha que falhou deixa o atendimento pendente (aparece no painel até regularizar).
  if (results.some((r) => !r.ok)) {
    await runTx((tx) => tx.stockAppointmentUsage.updateMany({ where: { companyId, appointmentId }, data: { status: 'PENDENTE' } }));
  }
  return results;
}

// Gancho do "Compareceu" na Agenda. Idempotente (só age se ainda não há
// registro de uso). CONFIRMADA: só abre a pendência. AUTOMATICA: baixa os itens
// fixos e não opcionais (nunca controlados); o resto vira pendência.
export async function onAppointmentAttended(runTx: RunTx, actor: Actor, appointmentId: string) {
  const companyId = actor.companyId;
  const prep = await runTx(async (tx) => {
    const existing = await tx.stockAppointmentUsage.findUnique({ where: { companyId_appointmentId: { companyId, appointmentId } } });
    if (existing) return null;
    const appt = await loadAppointment(tx, companyId, appointmentId);
    const kit = await findKitForType(tx, companyId, appt.type);
    if (!kit || kit.items.length === 0) return null; // sem ficha técnica: nada a baixar nem cobrar
    const mode = await resolveMode(tx, companyId, kit);
    const location = await locationForAppointment(tx, companyId, appt.roomId);
    await tx.stockAppointmentUsage.create({ data: { companyId, appointmentId, mode, status: 'PENDENTE', kitIds: [kit.id] } });
    const items = await tx.stockItem.findMany({ where: { companyId, id: { in: kit.items.map((i) => i.itemId) } }, select: { id: true, isControlled: true } });
    return { appt, kit, mode, location, controlled: new Set(items.filter((i) => i.isControlled).map((i) => i.id)) };
  });
  if (!prep || prep.mode !== 'AUTOMATICA') return { mode: prep?.mode ?? null, results: [] as LineResult[] };

  const { appt, kit, location, controlled } = prep;
  const results: LineResult[] = [];
  const recorded: string[] = [];
  let pending = false;
  for (const ki of kit.items) {
    if (ki.variable || ki.optional || controlled.has(ki.itemId) || num(ki.quantity) <= 0) { pending = true; continue; }
    if (!location) { pending = true; results.push({ itemId: ki.itemId, ok: false, error: 'Nenhum local de estoque ativo' }); continue; }
    try {
      const { movement, item } = await runTx((tx) => consumeForAppointment(tx, actor, {
        appointment: toRef(appt), itemId: ki.itemId, locationId: location.id, qty: num(ki.quantity), mode: 'AUTOMATICA', kitId: kit.id,
      }));
      results.push({ itemId: ki.itemId, ok: true, movementId: movement.id });
      if (item.tracksPatient) recorded.push(movement.id);
    } catch (e) {
      pending = true;
      if (e instanceof InsufficientBalanceError) results.push({ itemId: ki.itemId, ok: false, error: e.message, rejected: e.info });
      else if (e instanceof StockError) results.push({ itemId: ki.itemId, ok: false, error: e.message });
      else throw e;
    }
  }
  if (recorded.length > 0) await runTx((tx) => recordApplication(tx, actor, appt, recorded, 'AUTOMATICA'));
  await runTx((tx) => tx.stockAppointmentUsage.updateMany({
    where: { companyId, appointmentId },
    data: pending ? { status: 'PENDENTE' } : { status: 'AUTOMATICO', confirmedAt: new Date() },
  }));
  return { mode: 'AUTOMATICA' as const, results };
}

// Correção pelo painel: estorna uma linha (médico/recepção podem, exceto
// controlado, que segue só pela gestão). O atendimento volta a ficar pendente.
export async function reverseUsageLine(runTx: RunTx, actor: Actor, appointmentId: string, movementId: string, reason: string) {
  const companyId = actor.companyId;
  return runTx(async (tx) => {
    const appt = await loadAppointment(tx, companyId, appointmentId);
    assertCanAct(actor, appt);
    const mv = await tx.stockMovement.findFirst({ where: { id: movementId, companyId, appointmentId, type: 'CONSUMO_ATENDIMENTO' } });
    if (!mv) throw new StockError(404, 'Linha de material não encontrada neste atendimento');
    const created = await reverseMovement(tx, actor, mv.id, reason);
    await tx.stockAppointmentUsage.updateMany({ where: { companyId, appointmentId }, data: { status: 'PENDENTE' } });
    return created;
  });
}

// Gancho de "desfazer atendimento" (cancelar, faltou, reagendar depois de
// realizado): estorna as baixas. Controlado só a gestão estorna — para os
// demais, a linha fica e a função devolve o que sobrou para virar tarefa.
export async function onAppointmentUnattended(runTx: RunTx, actor: Actor, appointmentId: string, reason: string) {
  const companyId = actor.companyId;
  const open = await runTx((tx) => tx.stockMovement.findMany({
    where: { companyId, appointmentId, type: 'CONSUMO_ATENDIMENTO', reversedAt: null },
    select: { id: true, snapshot: true },
  }));
  const kept: { movementId: string; itemName: string; error: string }[] = [];
  for (const mv of open) {
    try {
      await runTx((tx) => reverseMovement(tx, actor, mv.id, reason));
    } catch (e) {
      if (!(e instanceof StockError)) throw e;
      kept.push({ movementId: mv.id, itemName: String((mv.snapshot as any)?.itemName ?? '—'), error: e.message });
    }
  }
  await runTx((tx) => tx.stockAppointmentUsage.deleteMany({ where: { companyId, appointmentId } }));
  return { reversed: open.length - kept.length, kept };
}
