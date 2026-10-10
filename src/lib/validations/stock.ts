import { z } from 'zod';
import { CONTROLLED_LISTS, LOSS_REASONS } from '@/lib/stock-caps';

// Quantidade em estoque: número finito, positivo, no máx. 4 casas (há consumo
// fracionado: 0,5 ml, 12,5 U). Tolerância p/ erro de representação float.
const qty = z
  .number({ invalid_type_error: 'Quantidade inválida' })
  .finite()
  .positive('Quantidade deve ser maior que zero')
  .max(1e9)
  .refine((n) => Math.abs(n * 1e4 - Math.round(n * 1e4)) < 1e-6, 'Máximo 4 casas decimais');

const qtyOptional = z
  .number({ invalid_type_error: 'Quantidade inválida' })
  .finite()
  .nonnegative()
  .max(1e9)
  .nullable()
  .optional();

const cost = z.number({ invalid_type_error: 'Custo inválido' }).finite().nonnegative().max(1e9);
const id = z.string().min(1);
const optId = z.string().min(1).nullable().optional();
const optText = (max = 500) => z.string().trim().max(max).nullable().optional();
const dateStr = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Data inválida')
  .nullable()
  .optional();

export const ITEM_KINDS = ['INSUMO', 'MEDICAMENTO', 'INJETAVEL', 'DESCARTAVEL', 'REVENDA', 'USO_INTERNO'] as const;
export const STORAGE_TEMPS = ['AMBIENTE', 'REFRIGERADO', 'CONGELADO'] as const;
export const LOCATION_TYPES = ['ALMOXARIFADO', 'SALA', 'GELADEIRA', 'CARRINHO', 'OUTRO'] as const;
export const LOT_STATUSES = ['LIBERADO', 'QUARENTENA', 'BLOQUEADO', 'RECOLHIDO'] as const;

export const CategorySchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(80),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).max(999).optional(),
});

export const LocationSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(80),
  type: z.enum(LOCATION_TYPES),
  roomId: optId,
  storageTemp: z.enum(STORAGE_TEMPS).default('AMBIENTE'),
  isDefault: z.boolean().optional(),
  controlledStorage: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const ItemBase = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(160),
  categoryId: optId,
  sku: optText(60),
  barcode: optText(60),
  kind: z.enum(ITEM_KINDS),
  manufacturer: optText(120),
  anvisaRegistration: optText(60),
  baseUnit: z.string().trim().min(1, 'Unidade base é obrigatória').max(20),
  purchaseUnit: optText(30),
  conversionFactor: z.number().finite().positive('Fator deve ser maior que zero').max(1e6).default(1),
  tracksLot: z.boolean().default(true),
  tracksExpiry: z.boolean().default(true),
  tracksPatient: z.boolean().default(false),
  isControlled: z.boolean().default(false),
  controlledList: z.enum(CONTROLLED_LISTS).nullable().optional(),
  controlledNote: optText(500),
  storageTemp: z.enum(STORAGE_TEMPS).default('AMBIENTE'),
  multiDose: z.boolean().default(false),
  openedShelfLifeHours: z.number().int().positive().max(24 * 365).nullable().optional(),
  minQty: qtyOptional,
  reorderPoint: qtyOptional,
  maxQty: qtyOptional,
  leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
  preferredSupplierId: optId,
  salePrice: cost.nullable().optional(),
  notes: optText(1000),
  isActive: z.boolean().optional(),
});

// Regras de cadastro que dependem de mais de um campo (§5.11): controlado exige
// a lista da Portaria 344 e é sempre rastreado por lote e por paciente; validade
// só existe com lote (item sem lote usa o lote implícito "PADRAO").
function itemRules(v: Partial<z.infer<typeof ItemBase>>, ctx: z.RefinementCtx) {
  if (v.isControlled && !v.controlledList) {
    ctx.addIssue({ code: 'custom', path: ['controlledList'], message: 'Item controlado exige a lista da Portaria 344/98' });
  }
  if (v.isControlled && (v.tracksLot === false || v.tracksPatient === false)) {
    ctx.addIssue({ code: 'custom', path: ['isControlled'], message: 'Item controlado é sempre rastreado por lote e por paciente' });
  }
  if (v.tracksExpiry && v.tracksLot === false) {
    ctx.addIssue({ code: 'custom', path: ['tracksExpiry'], message: 'Controle de validade exige controle de lote' });
  }
  if (v.minQty != null && v.reorderPoint != null && v.reorderPoint < v.minQty) {
    ctx.addIssue({ code: 'custom', path: ['reorderPoint'], message: 'Ponto de pedido não pode ser menor que o mínimo' });
  }
  if (v.maxQty != null && v.reorderPoint != null && v.maxQty < v.reorderPoint) {
    ctx.addIssue({ code: 'custom', path: ['maxQty'], message: 'Máximo não pode ser menor que o ponto de pedido' });
  }
}

export const CreateItemSchema = ItemBase.superRefine(itemRules);
// Edição parcial: a regra entre campos é revalidada no servidor sobre o
// registro MESCLADO (atual + patch) — ver normalizeItem.
export const UpdateItemSchema = ItemBase.partial();
export const validateItemRules = (merged: Record<string, unknown>) =>
  ItemBase.partial().superRefine(itemRules).safeParse(merged);

// ---- Movimentações (Fase 1) ----
// Entrada por compra com nota (ENTRADA_COMPRA → Contas a Pagar) é o Recebimento (Fase 2).
const Entrada = z.object({
  operation: z.literal('ENTRADA'),
  type: z.enum(['ENTRADA_AVULSA', 'ENTRADA_BONIFICACAO', 'ENTRADA_DEVOLUCAO']),
  itemId: id,
  locationId: id,
  quantity: qty,
  unit: z.enum(['base', 'purchase']).default('base'),
  unitCost: cost.nullable().optional(), // por unidade informada em `unit`
  lotNumber: optText(60),
  expiresAt: dateStr,
  manufacturedAt: dateStr,
  supplierId: optId,
  reason: optText(),
  confirmTemperature: z.boolean().optional(),
});

const Consumo = z.object({
  operation: z.literal('CONSUMO'),
  itemId: id,
  locationId: id,
  lotId: optId, // vazio = FEFO no local
  quantity: qty,
  patientId: optId,
  professionalId: optId,
  reason: optText(),
  ackControlledNote: z.boolean().optional(),
});

const Perda = z.object({
  operation: z.literal('PERDA'),
  itemId: id,
  locationId: id,
  lotId: id,
  quantity: qty,
  lossReason: z.enum(LOSS_REASONS),
  reason: optText(),
});

const Ajuste = z.object({
  operation: z.literal('AJUSTE'),
  itemId: id,
  locationId: id,
  lotId: id,
  direction: z.enum(['IN', 'OUT']),
  quantity: qty,
  reason: z.string().trim().min(3, 'Motivo é obrigatório').max(500),
});

const Transferencia = z.object({
  operation: z.literal('TRANSFERENCIA'),
  itemId: id,
  fromLocationId: id,
  toLocationId: id,
  lotId: optId, // vazio = FEFO na origem
  quantity: qty,
  reason: optText(),
  confirmTemperature: z.boolean().optional(),
});

export const MovementSchema = z.discriminatedUnion('operation', [Entrada, Consumo, Perda, Ajuste, Transferencia]);
export type MovementInput = z.infer<typeof MovementSchema>;

export const ReverseSchema = z.object({
  reason: z.string().trim().min(3, 'Motivo é obrigatório').max(500),
});

export const LotStatusSchema = z.object({
  status: z.enum(LOT_STATUSES),
  blockReason: optText(),
});

export const SettingsSchema = z.object({
  defaultConsumptionMode: z.enum(['AUTOMATICA', 'CONFIRMADA']).optional(),
  expiryAlertDays: z.number().int().min(1).max(365).optional(),
  overconsumptionAlertPct: z.number().int().min(1).max(500).optional(),
});

// ---- Recebimento (Fase 2) ----
const money = z
  .number({ invalid_type_error: 'Valor inválido' })
  .finite()
  .nonnegative()
  .max(1e9)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 casas decimais');

export const ReceiptLineSchema = z.object({
  itemId: id,
  lotNumber: optText(60),
  expiresAt: dateStr,
  locationId: id,
  qtyPurchase: qty, // na unidade de compra do item (fator 1 se não houver)
  unitPrice: money, // por unidade de compra
});

export const ReceiptDraftSchema = z.object({
  supplierId: optId,
  invoiceNumber: optText(30),
  invoiceKey: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ''))
    .refine((s) => s === '' || s.length === 44, 'A chave de acesso tem 44 dígitos')
    .nullable()
    .optional(),
  invoiceDate: dateStr,
  receivedAt: dateStr,
  freight: money.default(0),
  discount: money.default(0),
  notes: optText(1000),
  items: z.array(ReceiptLineSchema).max(300, 'Máximo de 300 linhas por recebimento').default([]),
});
export type ReceiptDraftInput = z.infer<typeof ReceiptDraftSchema>;

export const ReceiptPayableSchema = z.object({
  categoryId: optId,
  costCenterId: optId,
  installments: z.number().int().min(1).max(24).default(1),
  firstDueDate: dateStr,
  intervalDays: z.number().int().min(1).max(120).default(30),
});
export type ReceiptPayableInput = z.infer<typeof ReceiptPayableSchema>;

export const ReceiptConfirmSchema = ReceiptPayableSchema.extend({
  generatePayable: z.boolean().default(true),
  confirmTemperature: z.boolean().optional(),
});
export type ReceiptConfirmInput = z.infer<typeof ReceiptConfirmSchema>;
