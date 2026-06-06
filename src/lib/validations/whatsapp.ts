import { z } from "zod";

// Enums do schema WhatsApp
export enum InstanceStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  DISCONNECTED = "DISCONNECTED",
  ERROR = "ERROR",
}

export enum ConversationStatus {
  OPEN = "OPEN",
  PENDING = "PENDING",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum MessageType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
  AUDIO = "AUDIO",
  DOCUMENT = "DOCUMENT",
  LOCATION = "LOCATION",
  CONTACT = "CONTACT",
  STICKER = "STICKER",
  TEMPLATE = "TEMPLATE",
  BUTTON = "BUTTON",
  LIST = "LIST",
}

export enum MessageDirection {
  INCOMING = "INCOMING",
  OUTGOING = "OUTGOING",
}

export enum MessageStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}

export enum WebhookStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

// Schemas de validação
export const CreateWhatsAppInstanceSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  apiToken: z.string().min(1, "Token da API é obrigatório"),
  clinicId: z.string().cuid(),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
});

export const UpdateWhatsAppInstanceSchema = CreateWhatsAppInstanceSchema.partial().extend({
  id: z.string().cuid(),
  status: z.nativeEnum(InstanceStatus).optional(),
  isActive: z.boolean().optional(),
});

export const CreateWhatsAppContactSchema = z.object({
  phone: z.string().min(1, "Telefone é obrigatório"),
  name: z.string().optional(),
  isWAUser: z.boolean().default(false),
});

export const UpdateWhatsAppContactSchema = CreateWhatsAppContactSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateWhatsAppConversationSchema = z.object({
  contactId: z.string().cuid(),
  instanceId: z.string().cuid(),
  queueId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  assignedToId: z.string().cuid().optional(),
  subject: z.string().optional(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  patientId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
});

export const UpdateWhatsAppConversationSchema = CreateWhatsAppConversationSchema.partial().extend({
  id: z.string().cuid(),
  status: z.nativeEnum(ConversationStatus).optional(),
  isOpen: z.boolean().optional(),
});

export const CreateWhatsAppMessageSchema = z.object({
  conversationId: z.string().cuid(),
  contactId: z.string().cuid(),
  instanceId: z.string().cuid(),
  type: z.nativeEnum(MessageType),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  direction: z.nativeEnum(MessageDirection).default(MessageDirection.OUTGOING),
  mediaUrl: z.string().url().optional(),
  mediaType: z.string().optional(),
  quotedMessageId: z.string().cuid().optional(),
  authorId: z.string().cuid().optional(),
});

export const UpdateWhatsAppMessageSchema = CreateWhatsAppMessageSchema.partial().extend({
  id: z.string().cuid(),
  status: z.nativeEnum(MessageStatus).optional(),
  sentAt: z.string().datetime().optional(),
  readAt: z.string().datetime().optional(),
});

export const CreateWhatsAppQueueSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  clinicId: z.string().cuid(),
});

export const UpdateWhatsAppQueueSchema = CreateWhatsAppQueueSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateWhatsAppDepartmentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  clinicId: z.string().cuid(),
});

export const UpdateWhatsAppDepartmentSchema = CreateWhatsAppDepartmentSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateWhatsAppAssignmentSchema = z.object({
  conversationId: z.string().cuid(),
  assignedToId: z.string().cuid(),
  assignedById: z.string().cuid(),
  note: z.string().optional(),
});

export const CreateWhatsAppQuickReplySchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  shortcut: z.string().optional(),
});

export const UpdateWhatsAppQuickReplySchema = CreateWhatsAppQuickReplySchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateWhatsAppTagSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  color: z.string().optional(),
});

export const UpdateWhatsAppTagSchema = CreateWhatsAppTagSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateWhatsAppWebhookLogSchema = z.object({
  instanceId: z.string().cuid(),
  eventType: z.string().min(1, "Tipo de evento é obrigatório"),
  payload: z.string().min(1, "Payload é obrigatório"),
});

export const UpdateWhatsAppWebhookLogSchema = CreateWhatsAppWebhookLogSchema.partial().extend({
  id: z.string().cuid(),
  response: z.string().optional(),
  status: z.nativeEnum(WebhookStatus).optional(),
  errorMessage: z.string().optional(),
});

// Schemas para integração com outros módulos
export const CreatePatientFromConversationSchema = z.object({
  phone: z.string().min(1, "Telefone é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  cpf: z.string().min(1, "CPF é obrigatório"),
  birthDate: z.string().datetime(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  email: z.string().email().optional(),
  whatsapp: z.string().optional(),
  origin: z.enum(["WHATSAPP", "PHONE", "EMAIL", "WALK_IN", "REFERRAL"]).default("WHATSAPP"),
});

export const CreateDealFromConversationSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  valueEstimated: z.number().positive().optional(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  source: z.enum(["WHATSAPP", "PHONE", "EMAIL", "WALK_IN", "REFERRAL"]).default("WHATSAPP"),
  pipelineId: z.string().cuid(),
  stageId: z.string().cuid(),
  patientId: z.string().cuid(),
  responsibleUserId: z.string().cuid(),
});

// Schemas para operações
export const SendWhatsAppMessageSchema = z.object({
  conversationId: z.string().cuid(),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  mediaUrl: z.string().url().optional(),
  mediaType: z.string().optional(),
  quotedMessageId: z.string().cuid().optional(),
});

export const AssignConversationSchema = z.object({
  conversationId: z.string().cuid(),
  assignedToId: z.string().cuid(),
  note: z.string().optional(),
});

export const AddTagToConversationSchema = z.object({
  conversationId: z.string().cuid(),
  tagId: z.string().cuid(),
});

export const RemoveTagFromConversationSchema = z.object({
  conversationId: z.string().cuid(),
  tagId: z.string().cuid(),
});

export const UpdateConversationStatusSchema = z.object({
  conversationId: z.string().cuid(),
  status: z.nativeEnum(ConversationStatus),
  note: z.string().optional(),
});

// Tipos TypeScript
export type CreateWhatsAppInstanceInput = z.infer<typeof CreateWhatsAppInstanceSchema>;
export type UpdateWhatsAppInstanceInput = z.infer<typeof UpdateWhatsAppInstanceSchema>;
export type CreateWhatsAppContactInput = z.infer<typeof CreateWhatsAppContactSchema>;
export type UpdateWhatsAppContactInput = z.infer<typeof UpdateWhatsAppContactSchema>;
export type CreateWhatsAppConversationInput = z.infer<typeof CreateWhatsAppConversationSchema>;
export type UpdateWhatsAppConversationInput = z.infer<typeof UpdateWhatsAppConversationSchema>;
export type CreateWhatsAppMessageInput = z.infer<typeof CreateWhatsAppMessageSchema>;
export type UpdateWhatsAppMessageInput = z.infer<typeof UpdateWhatsAppMessageSchema>;
export type CreateWhatsAppQueueInput = z.infer<typeof CreateWhatsAppQueueSchema>;
export type UpdateWhatsAppQueueInput = z.infer<typeof UpdateWhatsAppQueueSchema>;
export type CreateWhatsAppDepartmentInput = z.infer<typeof CreateWhatsAppDepartmentSchema>;
export type UpdateWhatsAppDepartmentInput = z.infer<typeof UpdateWhatsAppDepartmentSchema>;
export type CreateWhatsAppAssignmentInput = z.infer<typeof CreateWhatsAppAssignmentSchema>;
export type CreateWhatsAppQuickReplyInput = z.infer<typeof CreateWhatsAppQuickReplySchema>;
export type UpdateWhatsAppQuickReplyInput = z.infer<typeof UpdateWhatsAppQuickReplySchema>;
export type CreateWhatsAppTagInput = z.infer<typeof CreateWhatsAppTagSchema>;
export type UpdateWhatsAppTagInput = z.infer<typeof UpdateWhatsAppTagSchema>;
export type CreateWhatsAppWebhookLogInput = z.infer<typeof CreateWhatsAppWebhookLogSchema>;
export type UpdateWhatsAppWebhookLogInput = z.infer<typeof UpdateWhatsAppWebhookLogSchema>;
export type CreatePatientFromConversationInput = z.infer<typeof CreatePatientFromConversationSchema>;
export type CreateDealFromConversationInput = z.infer<typeof CreateDealFromConversationSchema>;
export type SendWhatsAppMessageInput = z.infer<typeof SendWhatsAppMessageSchema>;
export type AssignConversationInput = z.infer<typeof AssignConversationSchema>;
export type AddTagToConversationInput = z.infer<typeof AddTagToConversationSchema>;
export type RemoveTagFromConversationInput = z.infer<typeof RemoveTagFromConversationInput>;
export type UpdateConversationStatusInput = z.infer<typeof UpdateConversationStatusSchema>;

// Funções utilitárias
export function validatePhoneNumber(phone: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = phone.replace(/\D/g, '');
  // Valida formato brasileiro (11 dígitos)
  return cleaned.length === 11 && cleaned.startsWith('1[0-9]{2}[0-9]{8}');
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `+55 ${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function isValidWhatsAppUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('wa.me') || urlObj.hostname.includes('api.whatsapp.com');
  } catch {
    return false;
  }
}