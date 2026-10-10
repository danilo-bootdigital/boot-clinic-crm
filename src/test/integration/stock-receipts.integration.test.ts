import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { postMovement, reverseMovement, type Actor } from '@/lib/stock/movements';
import { confirmReceipt, generatePendingPayable, reverseReceipt, saveReceiptDraft, MATERIAL_CATEGORY } from '@/lib/stock/receipts';
import { registerPayablePayment } from '@/lib/api/payable-service';
import { ReceiptConfirmSchema, ReceiptDraftSchema, ReceiptPayableSchema } from '@/lib/validations/stock';

// Integração REAL do Recebimento (Fase 2) contra PostgreSQL local: rateio no
// custo, conta(s) a pagar geradas na mesma transação, pendência p/ o
// financeiro e as travas do estorno. Mesmo esquema de RLS do stock-ledger
// (role sem bypass via SET LOCAL ROLE). Rodar: npm run test:integration.

const url = process.env.LOCAL_DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url: url || 'postgresql://invalid' } } });
const ROLE = 'stock_it_role';
const tag = `r${Date.now().toString(36)}`;
let reachable = false;

let companyId = '';
let userId = '';
let supplierId = '';
let almox = '';

function tenant<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ROLE}`);
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return fn(tx);
  }, { timeout: 30_000 });
}
const actor = (role = 'OWNER'): Actor => ({ id: userId, name: 'Teste', companyId, role });
const num = (d: unknown) => Number(String(d));
const draft = (input: Record<string, unknown>) => ReceiptDraftSchema.parse(input);
const confirmOpts = (input: Record<string, unknown> = {}, canCreatePayable = true) => ({ ...ReceiptConfirmSchema.parse(input), canCreatePayable });

async function makeItem(data: Partial<Prisma.StockItemUncheckedCreateInput> = {}) {
  return tenant((tx) => tx.stockItem.create({
    data: { companyId, name: `Item ${Math.random().toString(36).slice(2, 8)}`, kind: 'INJETAVEL', baseUnit: 'U', tracksExpiry: false, ...data },
  }));
}
async function balance(itemId: string) {
  return tenant(async (tx) => num((await tx.stockBalance.aggregate({ where: { companyId, itemId }, _sum: { quantity: true } }))._sum.quantity ?? 0));
}

beforeAll(async () => {
  if (!url) return;
  try { await db.$queryRaw`SELECT 1`; reachable = true; } catch { reachable = false; return; }
  await db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;`);
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLE}`);
  const company = await db.company.create({ data: { name: `IT recebimento ${tag}` } });
  companyId = company.id;
  userId = (await db.user.create({ data: { email: `it-${tag}@estoque.test`, name: 'IT', role: 'OWNER', companyId } })).id;
  supplierId = (await tenant((tx) => tx.supplier.create({ data: { companyId, name: `Distribuidora ${tag}` } }))).id;
  almox = (await tenant((tx) => tx.stockLocation.create({ data: { companyId, name: 'Almoxarifado', type: 'ALMOXARIFADO', isDefault: true } }))).id;
});

afterAll(async () => {
  if (reachable && companyId) {
    for (const t of ['stock_receipt_items', 'stock_receipts', 'stock_movements', 'stock_balances', 'stock_lots', 'stock_items', 'stock_locations',
      'financial_payable_payments', 'financial_payables', 'financial_expense_categories', 'financial_cost_centers', 'financial_suppliers']) {
      await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "companyId" = $1`, companyId);
    }
    await db.user.deleteMany({ where: { companyId } });
    await db.company.deleteMany({ where: { id: companyId } });
  }
  await db.$disconnect();
});

const skip = () => !reachable;

describe('integração PostgreSQL — recebimento de mercadoria', () => {
  it('DB acessível (senão o suite é pulado com aviso)', () => {
    if (!reachable) console.warn('⚠️  Postgres local indisponível — integração do recebimento PULADA.');
    expect(true).toBe(true);
  });

  it('confirma: frete/desconto rateados no custo, conta(s) a pagar em Material clínico', async () => {
    if (skip()) return;
    const toxina = await makeItem({ purchaseUnit: 'frasco', conversionFactor: new Prisma.Decimal(100) });
    const seringa = await makeItem({ kind: 'DESCARTAVEL', baseUnit: 'un', tracksLot: false });
    const r = await tenant((tx) => saveReceiptDraft(tx, actor(), null, draft({
      supplierId, invoiceNumber: '123', freight: 50, discount: 10,
      items: [
        { itemId: toxina.id, lotNumber: 'TX1', locationId: almox, qtyPurchase: 2, unitPrice: 900 },   // 1800
        { itemId: seringa.id, locationId: almox, qtyPurchase: 100, unitPrice: 2 },                     // 200
      ],
    })));
    expect(num(r.total)).toBe(2040);

    const done = await tenant((tx) => confirmReceipt(tx, actor(), r.id, confirmOpts({ installments: 3, firstDueDate: '2026-11-10' })));
    expect(done.status).toBe('CONFIRMADO');
    expect(done.payableIds).toHaveLength(3);

    // Toxina: 1800 + 90% de (50 − 10) = 1836 → 200U → 9,18/U. Seringa: 200 + 4 = 204 → 2,04/un.
    const [tx1, sr] = await tenant((tx) => Promise.all([
      tx.stockItem.findUniqueOrThrow({ where: { id: toxina.id } }),
      tx.stockItem.findUniqueOrThrow({ where: { id: seringa.id } }),
    ]));
    expect(num(tx1.avgCost)).toBeCloseTo(9.18, 6);
    expect(num(sr.avgCost)).toBeCloseTo(2.04, 6);
    expect(await balance(toxina.id)).toBe(200);

    const payables = await tenant((tx) => tx.payable.findMany({ where: { companyId, id: { in: done.payableIds } }, orderBy: { dueDate: 'asc' } }));
    expect(payables.reduce((s, p) => s + Math.round(num(p.finalAmount) * 100), 0)).toBe(204_000);
    expect(payables[0].supplierId).toBe(supplierId);
    expect(payables[0].description).toMatch(/NF 123 .*parcela 1\/3/);
    const cat = await tenant((tx) => tx.expenseCategory.findFirstOrThrow({ where: { id: payables[0].categoryId! } }));
    expect(cat.name).toBe(MATERIAL_CATEGORY);

    // Movimento de compra não se estorna sozinho pelo kardex.
    const mv = await tenant((tx) => tx.stockMovement.findFirstOrThrow({ where: { companyId, receiptId: r.id } }));
    await expect(tenant((tx) => reverseMovement(tx, actor(), mv.id, 'tentativa'))).rejects.toThrow(/Estorne pelo recebimento/);
    // Rascunho confirmado não volta a ser editado.
    await expect(tenant((tx) => saveReceiptDraft(tx, actor(), r.id, draft({ items: [] })))).rejects.toThrow(/rascunho/);
  });

  it('sem acesso a Contas a Pagar: entra no estoque e a conta fica pendente; financeiro gera depois', async () => {
    if (skip()) return;
    const item = await makeItem({ tracksLot: false });
    const r = await tenant((tx) => saveReceiptDraft(tx, actor('RECEPTION'), null, draft({
      supplierId, items: [{ itemId: item.id, locationId: almox, qtyPurchase: 10, unitPrice: 5 }],
    })));
    const done = await tenant((tx) => confirmReceipt(tx, actor('RECEPTION'), r.id, confirmOpts({}, false)));
    expect(done.payablePending).toBe(true);
    expect(done.payableIds).toHaveLength(0);
    expect(await balance(item.id)).toBe(10);

    const after = await tenant((tx) => generatePendingPayable(tx, actor('FINANCE'), r.id, ReceiptPayableSchema.parse({})));
    expect(after.payablePending).toBe(false);
    expect(after.payableIds).toHaveLength(1);
    await expect(tenant((tx) => generatePendingPayable(tx, actor('FINANCE'), r.id, ReceiptPayableSchema.parse({})))).rejects.toThrow(/já tem conta/);
  });

  it('estorno: desfaz entradas e cancela contas; bloqueia se pago ou se já consumido', async () => {
    if (skip()) return;
    // (a) estorno limpo
    const a = await makeItem({ tracksLot: false });
    const ra = await tenant((tx) => saveReceiptDraft(tx, actor(), null, draft({ supplierId, items: [{ itemId: a.id, locationId: almox, qtyPurchase: 4, unitPrice: 10 }] })));
    const ca = await tenant((tx) => confirmReceipt(tx, actor(), ra.id, confirmOpts()));
    await tenant((tx) => reverseReceipt(tx, actor(), ra.id, 'nota errada', true));
    expect(await balance(a.id)).toBe(0);
    const pa = await tenant((tx) => tx.payable.findFirstOrThrow({ where: { id: ca.payableIds[0] } }));
    expect(pa.status).toBe('CANCELADO');

    // (b) conta paga bloqueia
    const b = await makeItem({ tracksLot: false });
    const rb = await tenant((tx) => saveReceiptDraft(tx, actor(), null, draft({ supplierId, items: [{ itemId: b.id, locationId: almox, qtyPurchase: 1, unitPrice: 30 }] })));
    const cb = await tenant((tx) => confirmReceipt(tx, actor(), rb.id, confirmOpts()));
    await tenant((tx) => registerPayablePayment(tx, companyId, userId, cb.payableIds[0], { amount: 10, method: 'PIX' } as any));
    await expect(tenant((tx) => reverseReceipt(tx, actor(), rb.id, 'teste', true))).rejects.toThrow(/já tem pagamento/);
    expect(await balance(b.id)).toBe(1);

    // (c) material já consumido bloqueia — e nada muda (rollback)
    const c = await makeItem({ tracksLot: false });
    const rc = await tenant((tx) => saveReceiptDraft(tx, actor(), null, draft({ supplierId, items: [{ itemId: c.id, locationId: almox, qtyPurchase: 5, unitPrice: 1 }] })));
    const cc = await tenant((tx) => confirmReceipt(tx, actor(), rc.id, confirmOpts()));
    await tenant((tx) => postMovement(tx, actor(), { operation: 'CONSUMO', itemId: c.id, locationId: almox, quantity: 2 }));
    await expect(tenant((tx) => reverseReceipt(tx, actor(), rc.id, 'teste', true))).rejects.toThrow(/já saiu do estoque/);
    expect(await balance(c.id)).toBe(3);
    const pc = await tenant((tx) => tx.payable.findFirstOrThrow({ where: { id: cc.payableIds[0] } }));
    expect(pc.status).toBe('PENDENTE');

    // (d) sem acesso para cancelar conta → recusa
    await expect(tenant((tx) => reverseReceipt(tx, actor('MANAGER'), rc.id, 'teste', false))).rejects.toThrow(/Contas a Pagar/);
  });
});
