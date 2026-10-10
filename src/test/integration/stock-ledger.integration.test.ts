import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { postMovement, reverseMovement, InsufficientBalanceError, StockError, type Actor } from '@/lib/stock/movements';
import type { MovementInput } from '@/lib/validations/stock';

// Integração REAL do motor de estoque contra PostgreSQL local (container
// descartável). Valida o que só o banco garante: RLS por clínica, UPDATE
// condicional sob concorrência, CHECK de saldo ≥ 0 e rollback da transação.
// Requer: migrations aplicadas no LOCAL_DATABASE_URL. Rodar: npm run test:integration.
//
// O Postgres local roda como superusuário, que IGNORA RLS. Por isso cada
// transação troca para um role sem privilégio (`SET LOCAL ROLE`), igual ao
// app_user de produção.

const url = process.env.LOCAL_DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: url || 'postgresql://invalid' } } });
const ROLE = 'stock_it_role';
const tag = Date.now().toString(36);
let reachable = false;

type Ctx = { companyId: string; userId: string; patientId: string; professionalId: string; almox: string; geladeira: string; cofre: string };
let A: Ctx;
let B: Ctx;

// Mesmo contrato de withFinanceTenant, mas no banco local e com role sem bypass de RLS.
function tenant<T>(companyId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return fn(tx);
  }, { timeout: 20_000 });
}

const actor = (c: Ctx, role = 'OWNER'): Actor => ({ id: c.userId, name: 'Teste', companyId: c.companyId, role });
const post = (c: Ctx, input: MovementInput, role?: string) => tenant(c.companyId, (tx) => postMovement(tx, actor(c, role), input));
const num = (d: unknown) => Number(String(d));

async function balance(c: Ctx, itemId: string, locationId?: string) {
  return tenant(c.companyId, async (tx) => {
    const agg = await tx.stockBalance.aggregate({ where: { companyId: c.companyId, itemId, ...(locationId ? { locationId } : {}) }, _sum: { quantity: true } });
    return num(agg._sum.quantity ?? 0);
  });
}

async function ledgerSum(c: Ctx, itemId: string) {
  return tenant(c.companyId, async (tx) => {
    const agg = await tx.stockMovement.aggregate({ where: { companyId: c.companyId, itemId }, _sum: { quantity: true } });
    return num(agg._sum.quantity ?? 0);
  });
}

async function makeItem(c: Ctx, data: Partial<Prisma.StockItemUncheckedCreateInput> = {}) {
  return tenant(c.companyId, (tx) => tx.stockItem.create({
    data: { companyId: c.companyId, name: `Item ${Math.random().toString(36).slice(2, 8)}`, kind: 'INJETAVEL', baseUnit: 'U', ...data },
  }));
}

async function makeClinic(label: string): Promise<Ctx> {
  const company = await db.company.create({ data: { name: `IT estoque ${label} ${tag}` } });
  const user = await db.user.create({ data: { email: `it-${label}-${tag}@estoque.test`, name: `IT ${label}`, role: 'OWNER', companyId: company.id } });
  const patient = await db.patient.create({
    data: { name: 'Paciente IT', cpf: `${tag}${label}`.slice(0, 14), birthDate: new Date('1990-01-01'), gender: 'FEMALE', phone: '11999990000', origin: 'GOOGLE', companyId: company.id, createdById: user.id },
  });
  const professional = await db.professional.create({ data: { name: 'Dra. IT', companyId: company.id } });
  const locs = await tenant(company.id, async (tx) => ({
    almox: await tx.stockLocation.create({ data: { companyId: company.id, name: 'Almoxarifado', type: 'ALMOXARIFADO', isDefault: true } }),
    geladeira: await tx.stockLocation.create({ data: { companyId: company.id, name: 'Geladeira', type: 'GELADEIRA', storageTemp: 'REFRIGERADO' } }),
    cofre: await tx.stockLocation.create({ data: { companyId: company.id, name: 'Armário controlados', type: 'OUTRO', controlledStorage: true } }),
  }));
  return { companyId: company.id, userId: user.id, patientId: patient.id, professionalId: professional.id, almox: locs.almox.id, geladeira: locs.geladeira.id, cofre: locs.cofre.id };
}

beforeAll(async () => {
  if (!url) return;
  try { await db.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; return; }
  await db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;`);
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  A = await makeClinic('a');
  B = await makeClinic('b');
});

afterAll(async () => {
  if (reachable && A && B) {
    const ids = [A.companyId, B.companyId];
    for (const t of ['stock_movements', 'stock_balances', 'stock_lots', 'stock_items', 'stock_locations', 'stock_categories', 'stock_settings']) {
      await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "companyId" = ANY($1)`, ids);
    }
    await db.professional.deleteMany({ where: { companyId: { in: ids } } });
    await db.patient.deleteMany({ where: { companyId: { in: ids } } });
    await db.user.deleteMany({ where: { companyId: { in: ids } } });
    await db.company.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});

const skip = () => !reachable;

describe('integração PostgreSQL — motor do estoque', () => {
  it('DB acessível (senão o suite é pulado com aviso)', () => {
    if (!reachable) console.warn('⚠️  Postgres local indisponível — integração do estoque PULADA. Suba o container + migrations locais.');
    expect(true).toBe(true);
  });

  it('entrada atualiza saldo e custo médio ponderado; razão = saldo', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksExpiry: true });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 100, unit: 'base', unitCost: 10, lotNumber: 'L1', expiresAt: '2027-12-31' });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 100, unit: 'base', unitCost: 20, lotNumber: 'L2', expiresAt: '2027-06-30' });
    const after = await tenant(A.companyId, (tx) => tx.stockItem.findUniqueOrThrow({ where: { id: item.id } }));
    expect(num(after.avgCost)).toBe(15);
    expect(await balance(A, item.id)).toBe(200);
    expect(await ledgerSum(A, item.id)).toBe(200);
  });

  it('conversão de unidade de compra: 2 frascos de 100U = 200U', async () => {
    if (skip()) return;
    const item = await makeItem(A, { purchaseUnit: 'frasco', conversionFactor: new Prisma.Decimal(100), tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 2, unit: 'purchase', unitCost: 500, lotNumber: 'F1' });
    expect(await balance(A, item.id)).toBe(200);
    const after = await tenant(A.companyId, (tx) => tx.stockItem.findUniqueOrThrow({ where: { id: item.id } }));
    expect(num(after.avgCost)).toBe(5); // R$500 o frasco / 100U
  });

  it('consumo sem lote escolhido sai pelo FEFO (vence primeiro)', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksExpiry: true });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 10, unit: 'base', unitCost: 1, lotNumber: 'TARDE', expiresAt: '2028-01-01' });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 10, unit: 'base', unitCost: 1, lotNumber: 'CEDO', expiresAt: '2027-01-01' });
    const [mv] = await post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, quantity: 2.5 });
    expect((mv.snapshot as any).lotNumber).toBe('CEDO');
    expect(num(mv.quantity)).toBe(-2.5);
  });

  it('saída sem saldo é recusada, sem movimento e sem mexer no saldo', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksLot: false, tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 5, unit: 'base', unitCost: 1 });
    await expect(post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, quantity: 6 })).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await balance(A, item.id)).toBe(5);
    expect(await ledgerSum(A, item.id)).toBe(5);
  });

  it('concorrência: duas saídas que juntas passam do saldo — só uma passa', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksLot: false, tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 70, unit: 'base', unitCost: 1 });
    const results = await Promise.allSettled([
      post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, quantity: 60 }),
      post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, quantity: 60 }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientBalanceError);
    expect(await balance(A, item.id)).toBe(10);
  });

  it('CHECK do banco impede saldo negativo mesmo por fora do motor', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksLot: false, tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 1, unit: 'base', unitCost: 1 });
    await expect(tenant(A.companyId, (tx) => tx.$executeRaw`UPDATE stock_balances SET quantity = -1 WHERE "itemId" = ${item.id}`)).rejects.toThrow();
  });

  it('lote vencido não sai por consumo, mas sai como perda', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksExpiry: true });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 3, unit: 'base', unitCost: 1, lotNumber: 'VELHO', expiresAt: '2020-01-01' });
    const lot = await tenant(A.companyId, (tx) => tx.stockLot.findFirstOrThrow({ where: { itemId: item.id } }));
    await expect(post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, lotId: lot.id, quantity: 1 })).rejects.toThrow(/vencido/);
    await post(A, { operation: 'PERDA', itemId: item.id, locationId: A.almox, lotId: lot.id, quantity: 3, lossReason: 'VENCIMENTO' });
    expect(await balance(A, item.id)).toBe(0);
  });

  it('transferência: duas pernas; estorno desfaz as duas', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksExpiry: false, storageTemp: 'REFRIGERADO' });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.geladeira, quantity: 10, unit: 'base', unitCost: 2, lotNumber: 'T1' });
    // Refrigerado indo p/ local ambiente exige confirmação.
    await expect(post(A, { operation: 'TRANSFERENCIA', itemId: item.id, fromLocationId: A.geladeira, toLocationId: A.almox, quantity: 4 })).rejects.toThrow(/Confirme/);
    const legs = await post(A, { operation: 'TRANSFERENCIA', itemId: item.id, fromLocationId: A.geladeira, toLocationId: A.almox, quantity: 4, confirmTemperature: true });
    expect(legs).toHaveLength(2);
    expect(legs[0].transferId).toBe(legs[1].transferId);
    expect(await balance(A, item.id, A.almox)).toBe(4);
    expect(await balance(A, item.id, A.geladeira)).toBe(6);

    await tenant(A.companyId, (tx) => reverseMovement(tx, actor(A), legs[0].id, 'lançado errado'));
    expect(await balance(A, item.id, A.almox)).toBe(0);
    expect(await balance(A, item.id, A.geladeira)).toBe(10);
    await expect(tenant(A.companyId, (tx) => reverseMovement(tx, actor(A), legs[1].id, 'de novo'))).rejects.toThrow(/já foi estornada/);
    expect(await ledgerSum(A, item.id)).toBe(10);
  });

  it('estorno de entrada desfaz o custo médio; estorno sem saldo é recusado', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksLot: false, tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 100, unit: 'base', unitCost: 10 });
    const [second] = await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 100, unit: 'base', unitCost: 20 });
    await tenant(A.companyId, (tx) => reverseMovement(tx, actor(A), second.id, 'nota duplicada'));
    const after = await tenant(A.companyId, (tx) => tx.stockItem.findUniqueOrThrow({ where: { id: item.id } }));
    expect(num(after.avgCost)).toBeCloseTo(10, 6);

    const [first] = await tenant(A.companyId, (tx) => tx.stockMovement.findMany({ where: { itemId: item.id, type: 'ENTRADA_AVULSA', reversedAt: null } }));
    await post(A, { operation: 'CONSUMO', itemId: item.id, locationId: A.almox, quantity: 50 });
    await expect(tenant(A.companyId, (tx) => reverseMovement(tx, actor(A), first.id, 'teste'))).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it('controlado: guarda, permissão e dados obrigatórios da saída', async () => {
    if (skip()) return;
    const item = await makeItem(A, {
      kind: 'MEDICAMENTO', baseUnit: 'un', isControlled: true, controlledList: 'B1', tracksPatient: true,
      tracksExpiry: false, controlledNote: 'Conferir receita retida',
    });
    await expect(post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 10, unit: 'base', lotNumber: 'C1' }))
      .rejects.toThrow(/guarda de controlados/);
    await expect(post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.cofre, quantity: 10, unit: 'base', lotNumber: 'C1' }, 'RECEPTION'))
      .rejects.toThrow(/permissão/);
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.cofre, quantity: 10, unit: 'base', lotNumber: 'C1' });

    const base = { operation: 'CONSUMO' as const, itemId: item.id, locationId: A.cofre, quantity: 1 };
    await expect(post(A, base)).rejects.toThrow(/paciente/);
    await expect(post(A, { ...base, patientId: A.patientId })).rejects.toThrow(/profissional/);
    await expect(post(A, { ...base, patientId: A.patientId, professionalId: A.professionalId })).rejects.toThrow(/justificativa/);
    await expect(post(A, { ...base, patientId: A.patientId, professionalId: A.professionalId, reason: 'Sedação leve' })).rejects.toThrow(/observação/);
    const [mv] = await post(A, { ...base, patientId: A.patientId, professionalId: A.professionalId, reason: 'Sedação leve', ackControlledNote: true }, 'DOCTOR');
    expect((mv.snapshot as any).controlled).toBe(true);
    expect((mv.snapshot as any).patientName).toBe('Paciente IT');

    // Perda/ajuste/estorno de controlado: só gestão.
    const lot = await tenant(A.companyId, (tx) => tx.stockLot.findFirstOrThrow({ where: { itemId: item.id } }));
    await expect(post(A, { operation: 'PERDA', itemId: item.id, locationId: A.cofre, lotId: lot.id, quantity: 1, lossReason: 'QUEBRA' }, 'DOCTOR'))
      .rejects.toBeInstanceOf(StockError);
  });

  it('RLS: uma clínica não enxerga nem movimenta o estoque da outra', async () => {
    if (skip()) return;
    const item = await makeItem(A, { tracksLot: false, tracksExpiry: false });
    await post(A, { operation: 'ENTRADA', type: 'ENTRADA_AVULSA', itemId: item.id, locationId: A.almox, quantity: 5, unit: 'base', unitCost: 1 });
    const seenByB = await tenant(B.companyId, (tx) => tx.stockItem.count({ where: { id: item.id } }));
    expect(seenByB).toBe(0);
    // B tentando consumir o item de A (com o próprio companyId): item "não existe" para B.
    await expect(post(B, { operation: 'CONSUMO', itemId: item.id, locationId: B.almox, quantity: 1 })).rejects.toThrow(/não encontrado/);
    // Gravar linha com companyId de outra clínica: WITH CHECK da policy recusa.
    await expect(tenant(B.companyId, (tx) => tx.stockCategory.create({ data: { companyId: A.companyId, name: `invasão ${tag}` } }))).rejects.toThrow();
    // Sem tenant fixado: fail-closed (zero linhas).
    const noTenant = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
      return tx.stockItem.count();
    });
    expect(noTenant).toBe(0);
    expect(await balance(A, item.id)).toBe(5);
  });
});
