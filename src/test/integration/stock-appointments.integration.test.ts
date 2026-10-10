import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { postMovement, type Actor } from '@/lib/stock/movements';
import { confirmUsage, getUsagePanel, onAppointmentAttended, onAppointmentUnattended, reverseUsageLine, type RunTx } from '@/lib/stock/appointments';
import { saveKit } from '@/lib/stock/kits';
import { KitSchema, UsageConfirmSchema } from '@/lib/validations/stock';
import { STOCK_IT_ROLE, ensureStockTestRole } from './stock-db';

// Integração REAL da baixa no atendimento (Fase 3) contra PostgreSQL local:
// modos confirmado/automático, "quem confirmou primeiro fecha", médico só nos
// próprios atendimentos, registro no prontuário, estorno e atendimento desfeito.
// Rodar: npm run test:integration.

const url = process.env.LOCAL_DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: url || 'postgresql://invalid' } } });
const ROLE = STOCK_IT_ROLE;
const tag = `a${Date.now().toString(36)}`;
let reachable = false;

const ctx = { companyId: '', ownerId: '', doctorUserId: '', otherDoctorUserId: '', patientId: '', profId: '', otherProfId: '', almox: '', cofre: '' };

const runTx: RunTx = (fn) => db.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
  await tx.$executeRaw`SELECT set_config('app.company_id', ${ctx.companyId}, true)`;
  return fn(tx);
}, { timeout: 30_000 });

const as = (role: string, id = ctx.ownerId): Actor => ({ id, name: `IT ${role}`, companyId: ctx.companyId, role });
const num = (d: unknown) => Number(String(d));

async function makeItem(data: Partial<Prisma.StockItemUncheckedCreateInput> = {}) {
  return runTx((tx) => tx.stockItem.create({
    data: { companyId: ctx.companyId, name: `Item ${Math.random().toString(36).slice(2, 8)}`, kind: 'INJETAVEL', baseUnit: 'U', tracksExpiry: true, ...data },
  }));
}
async function stockIn(itemId: string, qty: number, lotNumber: string, expiresAt: string, locationId = ctx.almox) {
  await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId, locationId, quantity: qty, unit: 'base', unitCost: 1, lotNumber, expiresAt }));
}
async function makeAppointment(type: string, professionalId = ctx.profId) {
  return db.appointment.create({
    data: {
      companyId: ctx.companyId, patientId: ctx.patientId, professionalId, specialtyId: 'esp', type, status: 'ATTENDED',
      startAt: new Date(), endAt: new Date(Date.now() + 1_800_000), durationMinutes: 30, source: 'TESTE', createdById: ctx.ownerId, attendedAt: new Date(),
    },
  });
}
async function makeKit(name: string, appointmentType: string, mode: 'AUTOMATICA' | 'CONFIRMADA' | null, items: { itemId: string; quantity: number; variable?: boolean; optional?: boolean }[]) {
  return runTx((tx) => saveKit(tx, ctx.companyId, null, KitSchema.parse({ name, appointmentType, consumptionMode: mode, items })));
}
const usage = (appointmentId: string) => runTx((tx) => tx.stockAppointmentUsage.findFirst({ where: { appointmentId } }));
const consumedQty = (appointmentId: string, itemId: string) => runTx(async (tx) => {
  const agg = await tx.stockMovement.aggregate({ where: { appointmentId, itemId, type: { in: ['CONSUMO_ATENDIMENTO', 'ESTORNO'] } }, _sum: { quantity: true } });
  return 0 - num(agg._sum.quantity ?? 0) || 0; // evita -0
});

beforeAll(async () => {
  if (!url) return;
  try { await db.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; return; }
  await ensureStockTestRole(db);
  const company = await db.company.create({ data: { name: `IT atendimento ${tag}` } });
  ctx.companyId = company.id;
  ctx.ownerId = (await db.user.create({ data: { email: `it-o-${tag}@estoque.test`, name: 'Dono', role: 'OWNER', companyId: company.id } })).id;
  ctx.doctorUserId = (await db.user.create({ data: { email: `it-d-${tag}@estoque.test`, name: 'Dra. A', role: 'DOCTOR', companyId: company.id } })).id;
  ctx.otherDoctorUserId = (await db.user.create({ data: { email: `it-d2-${tag}@estoque.test`, name: 'Dr. B', role: 'DOCTOR', companyId: company.id } })).id;
  ctx.profId = (await db.professional.create({ data: { name: 'Dra. A', companyId: company.id, userId: ctx.doctorUserId } })).id;
  ctx.otherProfId = (await db.professional.create({ data: { name: 'Dr. B', companyId: company.id, userId: ctx.otherDoctorUserId } })).id;
  ctx.patientId = (await db.patient.create({
    data: { name: 'Paciente Fase 3', cpf: tag.slice(0, 14), birthDate: new Date('1985-05-05'), gender: 'FEMALE', phone: '11988887777', origin: 'GOOGLE', companyId: company.id, createdById: ctx.ownerId },
  })).id;
  await runTx(async (tx) => {
    ctx.almox = (await tx.stockLocation.create({ data: { companyId: ctx.companyId, name: 'Almoxarifado', type: 'ALMOXARIFADO', isDefault: true } })).id;
    ctx.cofre = (await tx.stockLocation.create({ data: { companyId: ctx.companyId, name: 'Cofre', type: 'OUTRO', controlledStorage: true } })).id;
  });
});

afterAll(async () => {
  if (reachable && ctx.companyId) {
    for (const t of ['stock_appointment_usages', 'stock_procedure_kit_items', 'stock_procedure_kits', 'stock_movements', 'stock_balances', 'stock_lots', 'stock_items', 'stock_locations', 'stock_settings']) {
      await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "companyId" = $1`, ctx.companyId);
    }
    await db.medicalRecord.deleteMany({ where: { companyId: ctx.companyId } });
    await db.appointment.deleteMany({ where: { companyId: ctx.companyId } });
    await db.patient.deleteMany({ where: { companyId: ctx.companyId } });
    await db.professional.deleteMany({ where: { companyId: ctx.companyId } });
    await db.user.deleteMany({ where: { companyId: ctx.companyId } });
    await db.company.deleteMany({ where: { id: ctx.companyId } });
  }
  await db.$disconnect();
});

const skip = () => !reachable;

describe('integração PostgreSQL — baixa no atendimento', () => {
  it('DB acessível (senão o suite é pulado com aviso)', () => {
    if (!reachable) console.warn('⚠️  Postgres local indisponível — integração da baixa no atendimento PULADA.');
    expect(true).toBe(true);
  });

  it('CONFIRMADA: "Compareceu" só abre a pendência; a conferência baixa com FEFO, paciente e prontuário', async () => {
    if (skip()) return;
    const toxina = await makeItem({ tracksPatient: true });
    const seringa = await makeItem({ kind: 'DESCARTAVEL', baseUnit: 'un', tracksLot: false, tracksExpiry: false });
    await stockIn(toxina.id, 100, 'TARDE', '2028-01-01');
    await stockIn(toxina.id, 100, 'CEDO', '2027-03-01');
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: seringa.id, locationId: ctx.almox, quantity: 50, unit: 'base', unitCost: 1 }));
    const kit = await makeKit(`Toxina ${tag}`, `Toxina ${tag}`, 'CONFIRMADA', [
      { itemId: toxina.id, quantity: 20, variable: true },
      { itemId: seringa.id, quantity: 2 },
    ]);
    const appt = await makeAppointment(`toxina ${tag}`); // tipo em minúsculas: casa sem diferenciar

    await onAppointmentAttended(runTx, as('RECEPTION'), appt.id);
    expect((await usage(appt.id))?.status).toBe('PENDENTE');
    expect(await consumedQty(appt.id, toxina.id)).toBe(0);

    const panel = await runTx((tx) => getUsagePanel(tx, as('RECEPTION'), appt.id));
    expect(panel.kitIds).toEqual([kit.id]);
    const tx1 = panel.proposed.find((p) => p.itemId === toxina.id)!;
    expect(tx1.suggestedLot?.lotNumber).toBe('CEDO');
    expect(tx1.variable).toBe(true);

    const results = await confirmUsage(runTx, as('DOCTOR', ctx.doctorUserId), appt.id, UsageConfirmSchema.parse({
      locationId: ctx.almox, kitIds: [kit.id], region: 'glabela',
      lines: [{ itemId: toxina.id, quantity: 24 }, { itemId: seringa.id, quantity: 2 }],
    }));
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await usage(appt.id))?.status).toBe('CONFIRMADO');

    const mv = await runTx((tx) => tx.stockMovement.findFirstOrThrow({ where: { appointmentId: appt.id, itemId: toxina.id } }));
    expect(mv.type).toBe('CONSUMO_ATENDIMENTO');
    expect(mv.patientId).toBe(ctx.patientId);
    expect(mv.professionalId).toBe(ctx.profId);
    expect((mv.snapshot as any).lotNumber).toBe('CEDO');
    expect((mv.snapshot as any).consumptionMode).toBe('CONFIRMADA');
    expect(mv.medicalRecordId).toBeTruthy();
    const record = await db.medicalRecord.findUniqueOrThrow({ where: { id: mv.medicalRecordId! } });
    expect(record.type).toBe('PROCEDURE');
    expect(record.content).toContain('lote CEDO');
    expect(record.content).toContain('glabela');

    // Quem confirmou primeiro fecha o painel: segunda conferência é recusada…
    await expect(confirmUsage(runTx, as('RECEPTION'), appt.id, UsageConfirmSchema.parse({ locationId: ctx.almox, lines: [] }))).rejects.toThrow(/já foram conferidos/);
    // …mas acrescentar material continua possível.
    const added = await confirmUsage(runTx, as('RECEPTION'), appt.id, UsageConfirmSchema.parse({ locationId: ctx.almox, add: true, lines: [{ itemId: seringa.id, quantity: 1 }] }));
    expect(added[0].ok).toBe(true);
    expect(await consumedQty(appt.id, seringa.id)).toBe(3);
  });

  it('médico só dá baixa nos próprios atendimentos', async () => {
    if (skip()) return;
    const item = await makeItem({ tracksLot: false, tracksExpiry: false });
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: ctx.almox, quantity: 10, unit: 'base', unitCost: 1 }));
    const appt = await makeAppointment('Consulta', ctx.otherProfId);
    const body = UsageConfirmSchema.parse({ locationId: ctx.almox, lines: [{ itemId: item.id, quantity: 1 }] });
    await expect(confirmUsage(runTx, as('DOCTOR', ctx.doctorUserId), appt.id, body)).rejects.toThrow(/próprios atendimentos/);
    const ok = await confirmUsage(runTx, as('DOCTOR', ctx.otherDoctorUserId), appt.id, body);
    expect(ok[0].ok).toBe(true);
  });

  it('AUTOMATICA: baixa os fixos; variável, opcional e controlado ficam pendentes; falta de saldo não trava', async () => {
    if (skip()) return;
    const gaze = await makeItem({ kind: 'DESCARTAVEL', baseUnit: 'un', tracksLot: false, tracksExpiry: false });
    const luva = await makeItem({ kind: 'DESCARTAVEL', baseUnit: 'par', tracksLot: false, tracksExpiry: false });
    const acido = await makeItem({ baseUnit: 'ml' });
    const sedativo = await makeItem({ kind: 'MEDICAMENTO', baseUnit: 'un', isControlled: true, controlledList: 'B1', tracksPatient: true, tracksExpiry: false });
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: gaze.id, locationId: ctx.almox, quantity: 10, unit: 'base', unitCost: 1 }));
    // luva sem saldo → falha, mas a gaze sai mesmo assim
    await stockIn(acido.id, 5, 'AC1', '2027-12-01');
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: sedativo.id, locationId: ctx.cofre, quantity: 5, unit: 'base', lotNumber: 'S1' }));
    await makeKit(`Preenchimento ${tag}`, `Preenchimento ${tag}`, 'AUTOMATICA', [
      { itemId: gaze.id, quantity: 4 },
      { itemId: luva.id, quantity: 1 },
      { itemId: acido.id, quantity: 1, variable: true },
      { itemId: sedativo.id, quantity: 1 },
    ]);
    const appt = await makeAppointment(`Preenchimento ${tag}`);

    const { results } = await onAppointmentAttended(runTx, as('RECEPTION'), appt.id);
    expect(results.find((r) => r.itemId === gaze.id)?.ok).toBe(true);
    const luvaResult = results.find((r) => r.itemId === luva.id);
    expect(luvaResult?.ok).toBe(false);
    expect(luvaResult && !luvaResult.ok && luvaResult.rejected?.requested).toBe(1);
    expect(results.some((r) => r.itemId === acido.id || r.itemId === sedativo.id)).toBe(false);
    expect(await consumedQty(appt.id, gaze.id)).toBe(4);
    expect(await consumedQty(appt.id, sedativo.id)).toBe(0);
    expect((await usage(appt.id))?.status).toBe('PENDENTE');
    const mv = await runTx((tx) => tx.stockMovement.findFirstOrThrow({ where: { appointmentId: appt.id, itemId: gaze.id } }));
    expect((mv.snapshot as any).consumptionMode).toBe('AUTOMATICA');

    // Idempotente: um segundo "Compareceu" não baixa de novo.
    await onAppointmentAttended(runTx, as('RECEPTION'), appt.id);
    expect(await consumedQty(appt.id, gaze.id)).toBe(4);

    // Kit só com fixos e saldo suficiente → AUTOMATICO, sem pendência.
    await makeKit(`Curativo ${tag}`, `Curativo ${tag}`, 'AUTOMATICA', [{ itemId: gaze.id, quantity: 1 }]);
    const appt2 = await makeAppointment(`Curativo ${tag}`);
    await onAppointmentAttended(runTx, as('RECEPTION'), appt2.id);
    expect((await usage(appt2.id))?.status).toBe('AUTOMATICO');
  });

  it('correção e atendimento desfeito: estorna; controlado só pela gestão', async () => {
    if (skip()) return;
    const fio = await makeItem({ tracksLot: false, tracksExpiry: false, baseUnit: 'un' });
    const ctrl = await makeItem({ kind: 'MEDICAMENTO', baseUnit: 'un', isControlled: true, controlledList: 'C1', tracksPatient: true, tracksExpiry: false, controlledNote: 'Receita retida' });
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: fio.id, locationId: ctx.almox, quantity: 10, unit: 'base', unitCost: 1 }));
    await runTx((tx) => postMovement(tx, as('OWNER'), { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: ctrl.id, locationId: ctx.cofre, quantity: 10, unit: 'base', lotNumber: 'K1' }));
    const appt = await makeAppointment('Avaliação');

    // Controlado exige justificativa e ciência; com elas, sai e vai ao prontuário.
    const bad = await confirmUsage(runTx, as('DOCTOR', ctx.doctorUserId), appt.id, UsageConfirmSchema.parse({ locationId: ctx.cofre, lines: [{ itemId: ctrl.id, quantity: 1 }] }));
    expect(bad[0].ok).toBe(false);
    expect((await usage(appt.id))?.status).toBe('PENDENTE');
    await confirmUsage(runTx, as('DOCTOR', ctx.doctorUserId), appt.id, UsageConfirmSchema.parse({ locationId: ctx.cofre, lines: [{ itemId: ctrl.id, quantity: 1, reason: 'Sedação', ackControlledNote: true }] }));
    await confirmUsage(runTx, as('RECEPTION'), appt.id, UsageConfirmSchema.parse({ locationId: ctx.almox, add: true, lines: [{ itemId: fio.id, quantity: 3 }] }));

    const fioMv = await runTx((tx) => tx.stockMovement.findFirstOrThrow({ where: { appointmentId: appt.id, itemId: fio.id } }));
    const ctrlMv = await runTx((tx) => tx.stockMovement.findFirstOrThrow({ where: { appointmentId: appt.id, itemId: ctrl.id, type: 'CONSUMO_ATENDIMENTO' } }));
    // Médico tem a capacidade de controlados, mas estorno de controlado é só da gestão; recepção nem movimenta.
    await expect(reverseUsageLine(runTx, as('DOCTOR', ctx.doctorUserId), appt.id, ctrlMv.id, 'errado')).rejects.toThrow(/só pela gestão/);
    await expect(reverseUsageLine(runTx, as('RECEPTION'), appt.id, ctrlMv.id, 'errado')).rejects.toThrow(/controlad/);
    await reverseUsageLine(runTx, as('RECEPTION'), appt.id, fioMv.id, 'quantidade errada');
    expect(await consumedQty(appt.id, fio.id)).toBe(0);
    expect((await usage(appt.id))?.status).toBe('PENDENTE');

    await confirmUsage(runTx, as('RECEPTION'), appt.id, UsageConfirmSchema.parse({ locationId: ctx.almox, add: true, lines: [{ itemId: fio.id, quantity: 2 }] }));
    // Recepção desfaz o atendimento: o fio volta; o controlado fica (vira tarefa para a gestão).
    const { reversed, kept } = await onAppointmentUnattended(runTx, as('RECEPTION'), appt.id, 'cancelado');
    expect(reversed).toBe(1);
    expect(kept).toHaveLength(1);
    expect(await consumedQty(appt.id, fio.id)).toBe(0);
    expect(await consumedQty(appt.id, ctrl.id)).toBe(1);
    expect(await usage(appt.id)).toBeNull();
    // A gestão consegue estornar o controlado.
    const left = await onAppointmentUnattended(runTx, as('MANAGER'), appt.id, 'cancelado');
    expect(left.kept).toHaveLength(0);
    expect(await consumedQty(appt.id, ctrl.id)).toBe(0);
  });
});
