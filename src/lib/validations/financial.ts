import { z } from 'zod';

// Dinheiro vindo do cliente: número finito, não-negativo, no máx. 2 casas.
// Rejeita 3+ casas de verdade (tolerância p/ erro de representação float).
const money = z
  .number({ invalid_type_error: 'Valor inválido' })
  .finite()
  .nonnegative()
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 casas decimais');

const moneyPositive = money.refine((n) => n > 0, 'Valor deve ser maior que zero');

export const PAYMENT_METHODS = [
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'TRANSFERENCIA',
  'BOLETO',
  'CHEQUE',
  'OUTRO',
] as const;

export const RECEIVABLE_SOURCES = ['APPOINTMENT', 'BUDGET', 'CONTRACT', 'MANUAL'] as const;

// Origem do recebível: exige paciente e um vínculo de origem (atendimento,
// orçamento ou contrato). A regra de cada origem — "Orçamento APPROVED",
// "Contrato SIGNED", "Atendimento ATTENDED" — é validada no serviço.
export const CreateReceivableSchema = z
  .object({
    patientId: z.string().min(1),
    // Origem explícita. Opcional p/ compatibilidade: quando ausente, o serviço
    // infere a partir de quoteId/contractId/appointmentId (payloads antigos).
    sourceType: z.enum(RECEIVABLE_SOURCES).optional(),
    appointmentId: z.string().min(1).optional(),
    quoteId: z.string().min(1).optional(),
    contractId: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    description: z.string().min(1, 'Descrição obrigatória').max(500),
    // Origem ORÇAMENTO/CONTRATO: `originalAmount` é IGNORADO — o valor é DERIVADO
    // da origem no servidor (anti-fraude). Origem ATENDIMENTO: o Appointment não
    // tem preço, então aqui o valor É o do payload (exigido, auditado e restrito
    // a quem tem a capacidade `create`).
    originalAmount: moneyPositive.optional(),
    // Segunda cobrança para o MESMO atendimento exige opt-in explícito do usuário
    // (o clique repetido em "Faturar atendimento" nunca duplica sozinho).
    allowDuplicate: z.boolean().default(false),
    discountAmount: money.default(0),
    // Parcelamento: contagem + 1ª data + intervalo (parcelas iguais com ajuste
    // de centavos na última) OU lista explícita (parcelas irregulares).
    installmentsCount: z.number().int().min(1).max(120).default(1),
    firstDueDate: z.coerce.date(),
    intervalDays: z.number().int().min(1).max(365).default(30),
    customInstallments: z
      .array(z.object({ dueDate: z.coerce.date(), amount: moneyPositive }))
      .min(1)
      .max(120)
      .optional(),
    issueDate: z.coerce.date().optional(),
    notes: z.string().max(2000).optional(),
  })
  // Cobrança MANUAL não tem origem de onde derivar valor: o valor passa a ser
  // obrigatório no payload e nenhum vínculo de origem pode vir junto (senão não
  // é manual — é uma cobrança de orçamento/contrato/atendimento mal rotulada).
  .refine(
    (d) => d.sourceType !== 'MANUAL' || (d.originalAmount != null && d.originalAmount > 0),
    { message: 'Cobrança manual exige valor', path: ['originalAmount'] },
  )
  .refine(
    (d) => d.sourceType !== 'MANUAL' || (!d.quoteId && !d.contractId && !d.appointmentId),
    { message: 'Cobrança manual não pode ter origem vinculada', path: ['sourceType'] },
  );
// Obs.: nas origens ORÇAMENTO/CONTRATO o desconto ≤ valor é validado no SERVIÇO
// contra o valor derivado da origem (o originalAmount do cliente é ignorado),
// evitando confiar no payload.

export type CreateReceivableInput = z.infer<typeof CreateReceivableSchema>;

export const RegisterPaymentSchema = z.object({
  amount: moneyPositive,
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});
export type RegisterPaymentInput = z.infer<typeof RegisterPaymentSchema>;

// Faturamento a partir da Agenda. Descrição e valor chegam editados pela tela
// (o atendimento não tem preço cadastrado). `payment` presente = "Faturar e
// receber": cria a cobrança e já registra a baixa na mesma transação.
export const BillAppointmentSchema = z.object({
  description: z.string().trim().min(1, 'Descrição obrigatória').max(500),
  amount: moneyPositive,
  dueDate: z.coerce.date(),
  categoryId: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
  allowDuplicate: z.boolean().default(false),
  payment: z
    .object({
      amount: moneyPositive,
      method: z.enum(PAYMENT_METHODS),
      paidAt: z.coerce.date().optional(),
    })
    .optional(),
});
export type BillAppointmentInput = z.infer<typeof BillAppointmentSchema>;

export const ReversePaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Motivo do estorno é obrigatório').max(1000),
});

export const CancelReceivableSchema = z.object({
  reason: z.string().trim().min(1, 'Motivo do cancelamento é obrigatório').max(1000),
});

export const CreateRevenueCategorySchema = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// ---- Contas a Pagar (Fase 2) ----

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório').max(160),
  document: z.string().trim().max(32).optional(),
  email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(32).optional(),
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().default(true),
});

// Atualização parcial de fornecedor (cadastro mestre — não afeta valores de despesas já lançadas).
export const UpdateSupplierSchema = z
  .object({
    name: z.string().trim().min(1, 'Nome obrigatório').max(160).optional(),
    document: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')).nullable(),
    phone: z.string().trim().max(32).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nada para atualizar' });

export const CreatePayableSchema = z
  .object({
    supplierId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    costCenterId: z.string().min(1).optional(),
    professionalId: z.string().min(1).optional(),
    description: z.string().trim().min(1, 'Descrição obrigatória').max(500),
    originalAmount: moneyPositive,
    discountAmount: money.default(0),
    dueDate: z.coerce.date(),
    issueDate: z.coerce.date().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((d) => d.discountAmount <= d.originalAmount, {
    message: 'Desconto não pode exceder o valor',
    path: ['discountAmount'],
  });
export type CreatePayableInput = z.infer<typeof CreatePayableSchema>;

export const RegisterPayablePaymentSchema = RegisterPaymentSchema; // mesma forma
export const ReversePayablePaymentSchema = ReversePaymentSchema;
export const CancelPayableSchema = CancelReceivableSchema;

export const CreateNamedCatalogSchema = z.object({
  name: z.string().trim().min(1).max(120),
  order: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// Atualização parcial de um item de catálogo (categoria/centro de custo).
export const UpdateNamedCatalogSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    order: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.order !== undefined || d.isActive !== undefined, {
    message: 'Nada para atualizar',
  });
