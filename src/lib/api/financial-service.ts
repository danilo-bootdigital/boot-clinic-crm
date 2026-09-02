import { Prisma, ReceivableStatus, InstallmentStatus, ReceivableSource } from '@prisma/client';
import type { TxClient } from '@/lib/db/financeTenant';
import type { BillAppointmentInput, CreateReceivableInput, RegisterPaymentInput } from '@/lib/validations/financial';

// =====================================================================
// Serviço do Módulo Financeiro — Fase 1 (Contas a Receber).
// Toda função recebe um `tx` (cliente de transação já com o tenant fixado
// via withFinanceTenant) — garante atomicidade e isolamento RLS.
// Dinheiro é manipulado em CENTAVOS (inteiro) e persistido como Decimal(12,2).
// =====================================================================

// ---- utilitários de dinheiro (centavos) — exportados p/ reuso (Contas a Pagar) ----
export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2); // string p/ Decimal(12,2)
export const dec = (c: number) => new Prisma.Decimal(fromCents(c));
export const decToNumber = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : Number(d.toString());

// Rateia `totalCents` em `count` parcelas iguais; o resto de centavos vai na
// ÚLTIMA parcela (Σ parcelas = total exato). Ex.: 100,00 / 3 → 33,33 · 33,33 · 33,34.
export function splitCents(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const parts = Array<number>(count).fill(base);
  parts[count - 1] += totalCents - base * count;
  return parts;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export const DEFAULT_REVENUE_CATEGORIES = [
  'Consulta',
  'Procedimento',
  'Programa',
  'Exame',
  'Produto',
  'Outros',
];

// Semeia as categorias padrão para a clínica se ainda não houver nenhuma.
// Idempotente (unique [companyId,name]). Roda dentro do tenant tx.
export async function ensureRevenueCategories(tx: TxClient, companyId: string) {
  const count = await tx.revenueCategory.count({ where: { companyId } });
  if (count > 0) return;
  await tx.revenueCategory.createMany({
    data: DEFAULT_REVENUE_CATEGORIES.map((name, i) => ({
      companyId,
      name,
      isDefault: true,
      order: i,
    })),
    skipDuplicates: true,
  });
}

export class FinancialError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// ---- criar recebível + parcelas ----
// Elege a origem da cobrança. `sourceType` explícito manda; sem ele, infere a
// partir do vínculo presente no payload (compatibilidade com chamadas antigas,
// que só mandavam quoteId ou contractId). Orçamento tem precedência sobre
// contrato — mesma regra de antes.
export function resolveSourceType(input: {
  sourceType?: string;
  appointmentId?: string;
  quoteId?: string;
  contractId?: string;
}): ReceivableSource {
  // MANUAL explícito é honrado mesmo com vínculo no payload — a incoerência é
  // rejeitada adiante, com mensagem clara, em vez de virar outra origem calada.
  if (input.sourceType === ReceivableSource.MANUAL) return ReceivableSource.MANUAL;
  if (input.sourceType === ReceivableSource.APPOINTMENT && input.appointmentId) return ReceivableSource.APPOINTMENT;
  if (input.sourceType === ReceivableSource.BUDGET && input.quoteId) return ReceivableSource.BUDGET;
  if (input.sourceType === ReceivableSource.CONTRACT && input.contractId) return ReceivableSource.CONTRACT;
  if (input.quoteId) return ReceivableSource.BUDGET;
  if (input.contractId) return ReceivableSource.CONTRACT;
  if (input.appointmentId) return ReceivableSource.APPOINTMENT;
  return ReceivableSource.MANUAL;
}

// Congela o contexto do atendimento no momento do faturamento. Renomear o
// médico ou mudar o tipo de consulta depois não reescreve a cobrança histórica.
async function buildAppointmentSnapshot(
  tx: TxClient,
  companyId: string,
  appointment: {
    id: string; patientId: string; professionalId: string; specialtyId: string;
    type: string; startAt: Date;
  },
): Promise<Prisma.InputJsonValue> {
  const [patient, professional, specialty] = await Promise.all([
    tx.patient.findFirst({ where: { id: appointment.patientId, companyId }, select: { name: true } }),
    tx.professional.findFirst({ where: { id: appointment.professionalId, companyId }, select: { name: true } }),
    tx.specialty.findFirst({ where: { id: appointment.specialtyId, companyId }, select: { name: true } }),
  ]);
  return {
    kind: 'APPOINTMENT',
    appointmentId: appointment.id,
    attendedAt: appointment.startAt.toISOString(),
    patientName: patient?.name ?? null,
    professionalId: appointment.professionalId,
    professionalName: professional?.name ?? null,
    specialtyName: specialty?.name ?? null,
    procedure: appointment.type,
    snapshotAt: new Date().toISOString(),
  };
}

export async function createReceivable(
  tx: TxClient,
  companyId: string,
  createdById: string,
  input: CreateReceivableInput,
) {
  // 1) Paciente válido na empresa.
  const patient = await tx.patient.findFirst({
    where: { id: input.patientId, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new FinancialError('Paciente não encontrado', 404);

  // 2) Origem obrigatória. Três vínculos aceitos hoje:
  //      ATENDIMENTO  → Appointment ATTENDED (consulta realizada, sem orçamento)
  //      ORÇAMENTO    → ClinicalQuote APPROVED
  //      CONTRATO     → PatientContract SIGNED
  // Para orçamento/contrato o VALOR é DERIVADO da origem no servidor (nunca do
  // payload) — a regra anti-fraude original, preservada intacta.
  //      MANUAL       → sem vínculo, valor do payload. Exige `sourceType: 'MANUAL'`
  //                      EXPLÍCITO e a capacidade `create_manual` (checada na rota):
  //                      é o único caminho de valor arbitrário, então não pode ser
  //                      alcançado por omissão — só por escolha deliberada.
  const sourceType = resolveSourceType(input);
  if (sourceType === ReceivableSource.MANUAL && input.sourceType !== ReceivableSource.MANUAL) {
    throw new FinancialError(
      'A receita deve nascer de um atendimento realizado, orçamento aprovado ou contrato assinado',
    );
  }
  let originCents: number | null = null;
  let sourceSnapshot: Prisma.InputJsonValue | undefined;

  if (sourceType === ReceivableSource.MANUAL) {
    // Sem origem de onde derivar: o valor É o do payload. A defesa aqui não é
    // o vínculo (não há), é o RBAC estreito + a auditoria da rota.
    if (input.appointmentId || input.quoteId || input.contractId) {
      throw new FinancialError('Cobrança manual não pode ter origem vinculada');
    }
    originCents = toCents(input.originalAmount ?? 0);
  }

  if (sourceType === ReceivableSource.APPOINTMENT) {
    // O Appointment não tem preço cadastrado, então aqui — e SÓ aqui — o valor
    // vem do payload. O que amarra a cobrança é a origem: precisa existir um
    // atendimento REALIZADO, da mesma empresa e do mesmo paciente.
    const appointment = await tx.appointment.findFirst({
      where: { id: input.appointmentId!, companyId, deletedAt: null },
      select: {
        id: true, patientId: true, professionalId: true, specialtyId: true,
        type: true, status: true, startAt: true,
      },
    });
    if (!appointment) throw new FinancialError('Atendimento não encontrado', 404);
    if (appointment.status !== 'ATTENDED') {
      throw new FinancialError('Só é possível faturar um atendimento marcado como realizado');
    }
    if (appointment.patientId !== input.patientId) {
      throw new FinancialError('Atendimento pertence a outro paciente');
    }
    // Anti-duplicidade de aplicação (não há unique no banco — um atendimento
    // PODE gerar várias cobranças, desde que o usuário peça explicitamente).
    if (!input.allowDuplicate) {
      const dup = await tx.receivable.findFirst({
        where: {
          companyId,
          appointmentId: appointment.id,
          deletedAt: null,
          status: { not: ReceivableStatus.CANCELADO },
        },
        select: { id: true },
      });
      if (dup) {
        throw new FinancialError('Este atendimento já possui uma cobrança', 409);
      }
    }
    originCents = toCents(input.originalAmount ?? 0);
    sourceSnapshot = await buildAppointmentSnapshot(tx, companyId, appointment);
  }

  // Simétrico ao contrato: validado sempre que vier no payload, para nunca
  // gravar um quoteId que não passou pelas regras (nem "ocupar" um orçamento
  // com uma cobrança cuja origem eleita é outra).
  if (input.quoteId) {
    const quote = await tx.clinicalQuote.findFirst({
      where: { id: input.quoteId, companyId, deletedAt: null },
      select: { status: true, patientId: true, total: true },
    });
    if (!quote) throw new FinancialError('Orçamento não encontrado', 404);
    if (quote.status !== 'APPROVED') throw new FinancialError('Orçamento precisa estar APROVADO para gerar receita');
    if (quote.patientId !== input.patientId) throw new FinancialError('Orçamento pertence a outro paciente');
    // dup-check exclui CANCELADO — permite refaturar um orçamento após cancelamento.
    const dup = await tx.receivable.findFirst({ where: { quoteId: input.quoteId, deletedAt: null, status: { not: ReceivableStatus.CANCELADO } }, select: { id: true } });
    if (dup) throw new FinancialError('Este orçamento já possui uma receita ativa', 409);
    if (sourceType === ReceivableSource.BUDGET) originCents = toCents(quote.total);
  }

  // Validado sempre que vier no payload — mesmo quando o orçamento é a origem
  // eleita — para nunca gravar um contractId que não passou pelas regras.
  if (input.contractId) {
    const contract = await tx.patientContract.findFirst({
      where: { id: input.contractId, companyId, deletedAt: null },
      select: { status: true, patientId: true, value: true },
    });
    if (!contract) throw new FinancialError('Contrato não encontrado', 404);
    if (contract.status !== 'SIGNED') throw new FinancialError('Contrato precisa estar ASSINADO para gerar receita');
    if (contract.patientId !== input.patientId) throw new FinancialError('Contrato pertence a outro paciente');
    const dup = await tx.receivable.findFirst({ where: { contractId: input.contractId, deletedAt: null, status: { not: ReceivableStatus.CANCELADO } }, select: { id: true } });
    if (dup) throw new FinancialError('Este contrato já possui uma receita ativa', 409);
    if (sourceType === ReceivableSource.CONTRACT) originCents = toCents(contract.value ?? 0);
  }

  // 3) Categoria (se informada) precisa ser da empresa.
  if (input.categoryId) {
    const cat = await tx.revenueCategory.findFirst({ where: { id: input.categoryId, companyId }, select: { id: true } });
    if (!cat) throw new FinancialError('Categoria inválida', 400);
  }

  // 4) Valores em centavos — original DERIVADO da origem; desconto vindo do input.
  const originalCents = originCents ?? 0;
  if (originalCents <= 0) {
    throw new FinancialError(
      sourceType === ReceivableSource.APPOINTMENT
        ? 'Informe o valor da cobrança do atendimento'
        : sourceType === ReceivableSource.MANUAL
          ? 'Informe o valor da cobrança manual'
          : 'Origem sem valor definido para gerar receita',
    );
  }
  const discountCents = toCents(input.discountAmount ?? 0);
  if (discountCents > originalCents) throw new FinancialError('Desconto não pode exceder o valor da origem');
  const finalCents = originalCents - discountCents;
  if (finalCents <= 0) throw new FinancialError('Valor final deve ser maior que zero');
  // DB-2: evita parcelas de R$0,00 (que travariam o recebível fora de PAGO).
  if (!input.customInstallments?.length && finalCents < input.installmentsCount) {
    throw new FinancialError('Valor insuficiente para o número de parcelas (mínimo 1 centavo por parcela)');
  }

  // 5) Plano de parcelas.
  const issueDate = input.issueDate ?? new Date();
  let plan: { number: number; amountCents: number; dueDate: Date }[];
  if (input.customInstallments?.length) {
    const sum = input.customInstallments.reduce((s, p) => s + toCents(p.amount), 0);
    if (sum !== finalCents) {
      throw new FinancialError('A soma das parcelas deve ser igual ao valor final');
    }
    plan = input.customInstallments.map((p, i) => ({ number: i + 1, amountCents: toCents(p.amount), dueDate: p.dueDate }));
  } else {
    const parts = splitCents(finalCents, input.installmentsCount);
    plan = parts.map((amountCents, i) => ({
      number: i + 1,
      amountCents,
      dueDate: i === 0 ? input.firstDueDate : addDays(input.firstDueDate, input.intervalDays * i),
    }));
  }

  // 6) Cria recebível + parcelas (atômico).
  const receivable = await tx.receivable.create({
    data: {
      companyId,
      patientId: input.patientId,
      sourceType,
      appointmentId: input.appointmentId,
      sourceSnapshot,
      quoteId: input.quoteId,
      contractId: input.contractId,
      dealId: input.dealId,
      categoryId: input.categoryId,
      description: input.description,
      originalAmount: dec(originalCents),
      discountAmount: dec(discountCents),
      finalAmount: dec(finalCents),
      installmentsCount: plan.length,
      issueDate,
      notes: input.notes,
      createdById,
      status: ReceivableStatus.PENDENTE,
      installments: {
        create: plan.map((p) => ({
          companyId,
          number: p.number,
          amount: dec(p.amountCents),
          dueDate: p.dueDate,
          status: InstallmentStatus.PENDENTE,
        })),
      },
    },
    include: { installments: { orderBy: { number: 'asc' } } },
  });
  return receivable;
}

// ---- registrar pagamento (baixa) ----
export async function registerPayment(
  tx: TxClient,
  companyId: string,
  createdById: string,
  installmentId: string,
  input: RegisterPaymentInput,
) {
  // Lock pessimista da parcela: serializa baixas concorrentes na MESMA parcela
  // (evita corrida em que duas baixas leem paidAmount=0 e sobre-baixam).
  await tx.$queryRaw`SELECT id FROM financial_installments WHERE id = ${installmentId} AND "companyId" = ${companyId} FOR UPDATE`;
  const installment = await tx.receivableInstallment.findFirst({
    where: { id: installmentId, companyId },
    include: { receivable: { select: { id: true, status: true } } },
  });
  if (!installment) throw new FinancialError('Parcela não encontrada', 404);
  if (installment.status === InstallmentStatus.CANCELADO || installment.receivable.status === ReceivableStatus.CANCELADO) {
    throw new FinancialError('Parcela/recebível cancelado não aceita pagamento');
  }
  if (installment.status === InstallmentStatus.PAGO) {
    throw new FinancialError('Parcela já está quitada');
  }

  const amountCents = toCents(input.amount);
  const dueCents = toCents(decToNumber(installment.amount));
  const paidCents = toCents(decToNumber(installment.paidAmount));
  if (paidCents + amountCents > dueCents) {
    throw new FinancialError('Pagamento excede o saldo da parcela');
  }

  const payment = await tx.installmentPayment.create({
    data: {
      companyId,
      installmentId,
      amount: dec(amountCents),
      method: input.method,
      paidAt: input.paidAt ?? new Date(),
      notes: input.notes,
      createdById,
    },
  });

  await recomputeInstallment(tx, companyId, installmentId);
  await recomputeReceivable(tx, companyId, installment.receivableId);
  return payment;
}

// ---- faturar um atendimento (Agenda → Financeiro) ----
// Orquestra as peças que já existem: createReceivable (com origem APPOINTMENT)
// e, quando o usuário escolhe "Faturar e receber", registerPayment na 1ª parcela.
// Nenhuma regra financeira nova mora aqui — só a composição das duas, na MESMA
// transação, para não deixar cobrança órfã se a baixa falhar.
export async function billAppointment(
  tx: TxClient,
  companyId: string,
  createdById: string,
  appointment: { id: string; patientId: string },
  input: BillAppointmentInput,
) {
  const receivable = await createReceivable(tx, companyId, createdById, {
    patientId: appointment.patientId,
    sourceType: 'APPOINTMENT',
    appointmentId: appointment.id,
    description: input.description,
    originalAmount: input.amount,
    discountAmount: 0,
    installmentsCount: 1, // atendimento avulso é cobrança única (à vista)
    firstDueDate: input.dueDate,
    intervalDays: 30,
    categoryId: input.categoryId,
    notes: input.notes,
    allowDuplicate: input.allowDuplicate,
  });

  // Cobrança e pagamento são entidades separadas: sem `payment`, nasce EM ABERTO
  // (PENDENTE) e NADA entra em "recebido".
  if (!input.payment) return { receivable, payment: null };

  const first = receivable.installments[0];
  const payment = await registerPayment(tx, companyId, createdById, first.id, {
    amount: input.payment.amount,
    method: input.payment.method,
    paidAt: input.payment.paidAt,
  });

  // Recarrega para devolver o estado já recomputado (PARCIAL/PAGO).
  const refreshed = await tx.receivable.findFirst({
    where: { id: receivable.id, companyId },
    include: { installments: { orderBy: { number: 'asc' }, include: { payments: { orderBy: { paidAt: 'asc' } } } } },
  });
  return { receivable: refreshed ?? receivable, payment };
}

// ---- estornar pagamento ----
export async function reversePayment(
  tx: TxClient,
  companyId: string,
  reversedById: string,
  paymentId: string,
  reason: string,
) {
  const payment = await tx.installmentPayment.findFirst({
    where: { id: paymentId, companyId },
    include: { installment: { select: { id: true, receivableId: true } } },
  });
  if (!payment) throw new FinancialError('Pagamento não encontrado', 404);
  if (payment.reversedAt) throw new FinancialError('Pagamento já estornado', 409);
  // Lock da parcela: serializa estorno vs. baixa concorrente na mesma parcela.
  await tx.$queryRaw`SELECT id FROM financial_installments WHERE id = ${payment.installment.id} AND "companyId" = ${companyId} FOR UPDATE`;

  await tx.installmentPayment.update({
    where: { id: paymentId },
    data: { reversedAt: new Date(), reversedById, reverseReason: reason },
  });
  await recomputeInstallment(tx, companyId, payment.installment.id);
  await recomputeReceivable(tx, companyId, payment.installment.receivableId);
}

// ---- cancelar recebível ----
export async function cancelReceivable(
  tx: TxClient,
  companyId: string,
  receivableId: string,
  reason: string,
) {
  await tx.$queryRaw`SELECT id FROM financial_receivables WHERE id = ${receivableId} AND "companyId" = ${companyId} FOR UPDATE`;
  const receivable = await tx.receivable.findFirst({
    where: { id: receivableId, companyId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!receivable) throw new FinancialError('Recebível não encontrado', 404);
  if (receivable.status === ReceivableStatus.CANCELADO) throw new FinancialError('Recebível já cancelado', 409);

  // SVC-2: não cancelar com dinheiro já recebido — estorne os pagamentos antes.
  // Mantém coerência do KPI "Recebido" e evita estado ambíguo (pago + cancelado).
  const paid = await tx.installmentPayment.count({
    where: { companyId, reversedAt: null, installment: { receivableId } },
  });
  if (paid > 0) {
    throw new FinancialError('Há pagamentos não estornados. Estorne os pagamentos antes de cancelar o recebível', 409);
  }

  await tx.receivable.update({
    where: { id: receivableId },
    data: { status: ReceivableStatus.CANCELADO, canceledAt: new Date(), canceledReason: reason },
  });
  // Parcelas ainda não pagas → CANCELADO (as pagas mantêm histórico).
  await tx.receivableInstallment.updateMany({
    where: { receivableId, status: { in: [InstallmentStatus.PENDENTE, InstallmentStatus.PARCIAL] } },
    data: { status: InstallmentStatus.CANCELADO },
  });
}

// ---- recálculo de status (verdade transacional) ----
async function recomputeInstallment(tx: TxClient, companyId: string, installmentId: string) {
  const inst = await tx.receivableInstallment.findFirst({
    where: { id: installmentId, companyId },
    include: { payments: { where: { reversedAt: null }, select: { amount: true, paidAt: true } } },
  });
  if (!inst) return;
  if (inst.status === InstallmentStatus.CANCELADO) return; // cancelada não muda por pagamento.

  const paidCents = inst.payments.reduce((s, p) => s + toCents(decToNumber(p.amount)), 0);
  const dueCents = toCents(decToNumber(inst.amount));
  let status: InstallmentStatus = InstallmentStatus.PENDENTE;
  let paidAt: Date | null = null;
  if (paidCents >= dueCents && dueCents > 0) {
    status = InstallmentStatus.PAGO;
    paidAt = inst.payments.reduce<Date | null>((latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest), null);
  } else if (paidCents > 0) {
    status = InstallmentStatus.PARCIAL;
  }
  await tx.receivableInstallment.update({
    where: { id: installmentId },
    data: { paidAmount: dec(paidCents), status, paidAt },
  });
}

async function recomputeReceivable(tx: TxClient, companyId: string, receivableId: string) {
  const r = await tx.receivable.findFirst({
    where: { id: receivableId, companyId },
    select: { id: true, status: true },
  });
  if (!r || r.status === ReceivableStatus.CANCELADO) return;

  const installments = await tx.receivableInstallment.findMany({
    where: { receivableId, companyId },
    select: { status: true, paidAmount: true },
  });
  const active = installments.filter((i) => i.status !== InstallmentStatus.CANCELADO);
  const allPaid = active.length > 0 && active.every((i) => i.status === InstallmentStatus.PAGO);
  const anyPaid = active.some((i) => decToNumber(i.paidAmount) > 0);

  const status = allPaid ? ReceivableStatus.PAGO : anyPaid ? ReceivableStatus.PARCIAL : ReceivableStatus.PENDENTE;
  await tx.receivable.update({ where: { id: receivableId }, data: { status } });
}

// ---- serialização p/ a API (Decimal → number) + "vencido" DERIVADO ----
// "Vencido" não é status persistido (decisão aprovada): é calculado na leitura.
export function isInstallmentOverdue(i: { status: InstallmentStatus; dueDate: Date }, now = new Date()): boolean {
  return (i.status === InstallmentStatus.PENDENTE || i.status === InstallmentStatus.PARCIAL) && i.dueDate < now;
}

export function serializeInstallment(i: any, now = new Date()) {
  return {
    id: i.id,
    number: i.number,
    amount: decToNumber(i.amount),
    paidAmount: decToNumber(i.paidAmount),
    dueDate: i.dueDate,
    paidAt: i.paidAt ?? null,
    status: i.status,
    overdue: isInstallmentOverdue(i, now),
    notes: i.notes ?? null,
    payments: (i.payments ?? []).map((p: any) => ({
      id: p.id,
      amount: decToNumber(p.amount),
      method: p.method,
      paidAt: p.paidAt,
      notes: p.notes ?? null,
      reversedAt: p.reversedAt ?? null,
      reverseReason: p.reverseReason ?? null,
    })),
  };
}

export function serializeReceivable(r: any, now = new Date()) {
  const installments = (r.installments ?? []).map((i: any) => serializeInstallment(i, now));
  const anyOverdue = installments.some((i: any) => i.overdue);
  // Rótulo de exibição: VENCIDO sobrepõe PENDENTE/PARCIAL quando há parcela vencida.
  const displayStatus =
    (r.status === 'PENDENTE' || r.status === 'PARCIAL') && anyOverdue ? 'VENCIDO' : r.status;
  const paidAmount = installments.reduce((s: number, i: any) => s + i.paidAmount, 0);
  return {
    id: r.id,
    patientId: r.patientId,
    sourceType: r.sourceType ?? null,
    sourceSnapshot: r.sourceSnapshot ?? null,
    appointmentId: r.appointmentId ?? null,
    quoteId: r.quoteId ?? null,
    contractId: r.contractId ?? null,
    dealId: r.dealId ?? null,
    categoryId: r.categoryId ?? null,
    description: r.description,
    originalAmount: decToNumber(r.originalAmount),
    discountAmount: decToNumber(r.discountAmount),
    finalAmount: decToNumber(r.finalAmount),
    paidAmount,
    balance: Number((decToNumber(r.finalAmount) - paidAmount).toFixed(2)),
    installmentsCount: r.installmentsCount,
    status: r.status,
    displayStatus,
    overdue: anyOverdue,
    issueDate: r.issueDate,
    notes: r.notes ?? null,
    canceledAt: r.canceledAt ?? null,
    canceledReason: r.canceledReason ?? null,
    createdAt: r.createdAt,
    installments,
  };
}
