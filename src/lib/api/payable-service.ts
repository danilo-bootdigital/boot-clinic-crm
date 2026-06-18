import { PayableStatus } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import { toCents, dec, decToNumber, FinancialError } from '@/lib/api/financial-service';
import type { CreatePayableInput, RegisterPaymentInput } from '@/lib/validations/financial';

// =====================================================================
// Serviço do Contas a Pagar (Fase 2). Espelha o de recebíveis: opera dentro
// de um tx com tenant fixado (withFinanceTenant), dinheiro em centavos, lock
// pessimista na baixa, cancelar só sem pagamento. PayablePayment alimenta o
// fluxo de caixa (Fase 5) e a DRE (Fase 11) de graça.
// =====================================================================

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Marketing', 'Aluguel', 'Salários', 'Impostos', 'Infraestrutura', 'Fornecedores', 'Outros',
];
export const DEFAULT_COST_CENTERS = [
  'Administrativo', 'Comercial', 'Marketing', 'Clínica', 'Estética', 'Emagrecimento', 'Nutrologia',
];

export async function ensureExpenseCatalog(tx: TxClient, companyId: string) {
  const [cats, ccs] = await Promise.all([
    tx.expenseCategory.count({ where: { companyId } }),
    tx.costCenter.count({ where: { companyId } }),
  ]);
  if (cats === 0) {
    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({ companyId, name, isDefault: true, order: i })),
      skipDuplicates: true,
    });
  }
  if (ccs === 0) {
    await tx.costCenter.createMany({
      data: DEFAULT_COST_CENTERS.map((name, i) => ({ companyId, name, isDefault: true, order: i })),
      skipDuplicates: true,
    });
  }
}

async function assertOwned(tx: TxClient, model: 'supplier' | 'expenseCategory' | 'costCenter', id: string | undefined, companyId: string, label: string) {
  if (!id) return;
  const row = await (tx as any)[model].findFirst({ where: { id, companyId }, select: { id: true } });
  if (!row) throw new FinancialError(`${label} inválido`, 400);
}

export async function createPayable(tx: TxClient, companyId: string, createdById: string, input: CreatePayableInput) {
  await assertOwned(tx, 'supplier', input.supplierId, companyId, 'Fornecedor');
  await assertOwned(tx, 'expenseCategory', input.categoryId, companyId, 'Categoria');
  await assertOwned(tx, 'costCenter', input.costCenterId, companyId, 'Centro de custo');

  const originalCents = toCents(input.originalAmount);
  const discountCents = toCents(input.discountAmount ?? 0);
  if (discountCents > originalCents) throw new FinancialError('Desconto não pode exceder o valor');
  const finalCents = originalCents - discountCents;
  if (finalCents <= 0) throw new FinancialError('Valor final deve ser maior que zero');

  return tx.payable.create({
    data: {
      companyId,
      supplierId: input.supplierId,
      categoryId: input.categoryId,
      costCenterId: input.costCenterId,
      professionalId: input.professionalId,
      description: input.description,
      originalAmount: dec(originalCents),
      discountAmount: dec(discountCents),
      finalAmount: dec(finalCents),
      issueDate: input.issueDate ?? new Date(),
      dueDate: input.dueDate,
      notes: input.notes,
      createdById,
      status: PayableStatus.PENDENTE,
    },
  });
}

export async function registerPayablePayment(tx: TxClient, companyId: string, createdById: string, payableId: string, input: RegisterPaymentInput) {
  // Lock pessimista da conta — serializa baixas concorrentes (lição da Fase 1).
  await tx.$queryRaw`SELECT id FROM financial_payables WHERE id = ${payableId} AND "companyId" = ${companyId} FOR UPDATE`;
  const payable = await tx.payable.findFirst({ where: { id: payableId, companyId, deletedAt: null } });
  if (!payable) throw new FinancialError('Conta a pagar não encontrada', 404);
  if (payable.status === PayableStatus.CANCELADO) throw new FinancialError('Conta cancelada não aceita pagamento');
  if (payable.status === PayableStatus.PAGO) throw new FinancialError('Conta já está quitada');

  const amountCents = toCents(input.amount);
  const finalCents = toCents(decToNumber(payable.finalAmount));
  const paidCents = toCents(decToNumber(payable.paidAmount));
  if (paidCents + amountCents > finalCents) throw new FinancialError('Pagamento excede o saldo da conta');

  const payment = await tx.payablePayment.create({
    data: { companyId, payableId, amount: dec(amountCents), method: input.method, paidAt: input.paidAt ?? new Date(), notes: input.notes, createdById },
  });
  await recomputePayable(tx, companyId, payableId);
  return payment;
}

export async function reversePayablePayment(tx: TxClient, companyId: string, reversedById: string, paymentId: string, reason: string) {
  const payment = await tx.payablePayment.findFirst({ where: { id: paymentId, companyId }, select: { id: true, payableId: true, reversedAt: true } });
  if (!payment) throw new FinancialError('Pagamento não encontrado', 404);
  if (payment.reversedAt) throw new FinancialError('Pagamento já estornado', 409);
  await tx.$queryRaw`SELECT id FROM financial_payables WHERE id = ${payment.payableId} AND "companyId" = ${companyId} FOR UPDATE`;
  await tx.payablePayment.update({ where: { id: paymentId }, data: { reversedAt: new Date(), reversedById, reverseReason: reason } });
  await recomputePayable(tx, companyId, payment.payableId);
}

export async function cancelPayable(tx: TxClient, companyId: string, payableId: string, reason: string) {
  await tx.$queryRaw`SELECT id FROM financial_payables WHERE id = ${payableId} AND "companyId" = ${companyId} FOR UPDATE`;
  const payable = await tx.payable.findFirst({ where: { id: payableId, companyId, deletedAt: null }, select: { id: true, status: true } });
  if (!payable) throw new FinancialError('Conta a pagar não encontrada', 404);
  if (payable.status === PayableStatus.CANCELADO) throw new FinancialError('Conta já cancelada', 409);
  const paid = await tx.payablePayment.count({ where: { companyId, payableId, reversedAt: null } });
  if (paid > 0) throw new FinancialError('Há pagamentos não estornados. Estorne antes de cancelar', 409);
  await tx.payable.update({ where: { id: payableId }, data: { status: PayableStatus.CANCELADO, canceledAt: new Date(), canceledReason: reason } });
}

async function recomputePayable(tx: TxClient, companyId: string, payableId: string) {
  const p = await tx.payable.findFirst({
    where: { id: payableId, companyId },
    select: { id: true, status: true, finalAmount: true, payments: { where: { reversedAt: null }, select: { amount: true } } },
  });
  if (!p || p.status === PayableStatus.CANCELADO) return;
  const paidCents = p.payments.reduce((s, x) => s + toCents(decToNumber(x.amount)), 0);
  const finalCents = toCents(decToNumber(p.finalAmount));
  const status = paidCents >= finalCents && finalCents > 0 ? PayableStatus.PAGO : paidCents > 0 ? PayableStatus.PARCIAL : PayableStatus.PENDENTE;
  await tx.payable.update({ where: { id: payableId }, data: { paidAmount: dec(paidCents), status } });
}

export function isPayableOverdue(p: { status: PayableStatus; dueDate: Date }, now = new Date()): boolean {
  return (p.status === PayableStatus.PENDENTE || p.status === PayableStatus.PARCIAL) && p.dueDate < now;
}

export function serializePayable(p: any, now = new Date()) {
  const paidAmount = decToNumber(p.paidAmount);
  const finalAmount = decToNumber(p.finalAmount);
  const overdue = isPayableOverdue(p, now);
  return {
    id: p.id,
    supplierId: p.supplierId ?? null,
    categoryId: p.categoryId ?? null,
    costCenterId: p.costCenterId ?? null,
    professionalId: p.professionalId ?? null,
    description: p.description,
    originalAmount: decToNumber(p.originalAmount),
    discountAmount: decToNumber(p.discountAmount),
    finalAmount,
    paidAmount,
    balance: Number((finalAmount - paidAmount).toFixed(2)),
    status: p.status,
    displayStatus: (p.status === 'PENDENTE' || p.status === 'PARCIAL') && overdue ? 'VENCIDO' : p.status,
    overdue,
    issueDate: p.issueDate,
    dueDate: p.dueDate,
    notes: p.notes ?? null,
    canceledAt: p.canceledAt ?? null,
    canceledReason: p.canceledReason ?? null,
    supplierName: p.supplier?.name ?? null,
    categoryName: p.category?.name ?? null,
    costCenterName: p.costCenter?.name ?? null,
    payments: (p.payments ?? []).map((x: any) => ({
      id: x.id, amount: decToNumber(x.amount), method: x.method, paidAt: x.paidAt,
      notes: x.notes ?? null, reversedAt: x.reversedAt ?? null, reverseReason: x.reverseReason ?? null,
    })),
    createdAt: p.createdAt,
  };
}
