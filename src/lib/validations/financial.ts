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

// Origem do recebível: exige paciente e, opcionalmente, orçamento/contrato/deal.
// A regra "nascer de Orçamento APPROVED / Contrato SIGNED" é validada no serviço.
export const CreateReceivableSchema = z
  .object({
    patientId: z.string().min(1),
    quoteId: z.string().min(1).optional(),
    contractId: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    description: z.string().min(1, 'Descrição obrigatória').max(500),
    // originalAmount é IGNORADO no servidor: o valor é DERIVADO do orçamento/contrato
    // de origem (anti-fraude). Mantido opcional só p/ compat. do payload do form.
    originalAmount: moneyPositive.optional(),
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
  });
// Obs.: desconto ≤ valor é validado no SERVIÇO contra o valor derivado da origem
// (o originalAmount do cliente é ignorado), evitando confiar no payload.

export type CreateReceivableInput = z.infer<typeof CreateReceivableSchema>;

export const RegisterPaymentSchema = z.object({
  amount: moneyPositive,
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
});
export type RegisterPaymentInput = z.infer<typeof RegisterPaymentSchema>;

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
