import { z } from "zod";

// Enums do schema de Follow-up e Automações
export enum FollowUpType {
  MANUAL = "MANUAL",
  AUTOMATIC = "AUTOMATIC",
  RECURRING = "RECURRING",
}

export enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELED = "CANCELED",
  OVERDUE = "OVERDUE",
}

export enum TaskType {
  FOLLOW_UP = "FOLLOW_UP",
  REMINDER = "REMINDER",
  ALERT = "ALERT",
  TASK = "TASK",
}

export enum RecurrenceType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

export enum EntityType {
  PATIENT = "PATIENT",
  DEAL = "DEAL",
  APPOINTMENT = "APPOINTMENT",
  WHATSAPP_CONVERSATION = "WHATSAPP_CONVERSATION",
}

export enum ActionType {
  CREATE_TASK = "CREATE_TASK",
  CREATE_FOLLOW_UP = "CREATE_FOLLOW_UP",
  MOVE_PIPELINE_STAGE = "MOVE_PIPELINE_STAGE",
  SEND_NOTIFICATION = "SEND_NOTIFICATION",
  SEND_WHATSAPP = "SEND_WHATSAPP",
  CREATE_TIMELINE_EVENT = "CREATE_TIMELINE_EVENT",
  ASSIGN_USER = "ASSIGN_USER",
  UPDATE_STATUS = "UPDATE_STATUS",
}

export enum ExecutionStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
}

export enum NotificationType {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  SUCCESS = "SUCCESS",
}

// Schemas de validação para Follow-up Templates
export const CreateFollowUpTemplateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  type: z.nativeEnum(FollowUpType),
  dueHours: z.number().min(0, "Horas devem ser positivas"),
  isRecurring: z.boolean().default(false),
  recurrenceType: z.nativeEnum(RecurrenceType).optional(),
  recurrenceEvery: z.number().min(1).optional(),
});

export const UpdateFollowUpTemplateSchema = CreateFollowUpTemplateSchema.partial().extend({
  id: z.string().cuid(),
});

// Schemas de validação para Follow-up Tasks
export const CreateFollowUpTaskSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  dueDate: z.string().min(1, "Data de vencimento é obrigatória"),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.PENDING),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  type: z.nativeEnum(TaskType),
  templateId: z.string().cuid().optional(),
  assignedToId: z.string().cuid().optional(),
  patientId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
  appointmentId: z.string().cuid().optional(),
});

export const UpdateFollowUpTaskSchema = CreateFollowUpTaskSchema.partial().extend({
  id: z.string().cuid(),
});

export const UpdateFollowUpTaskStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.nativeEnum(TaskStatus),
  completedAt: z.string().optional(),
  canceledAt: z.string().optional(),
  canceledReason: z.string().optional(),
});

// Schemas de validação para Automações
export const CreateAutomationRuleSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const UpdateAutomationRuleSchema = CreateAutomationRuleSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateAutomationTriggerSchema = z.object({
  ruleId: z.string().cuid(),
  entityType: z.nativeEnum(EntityType),
  event: z.string().min(1, "Evento é obrigatório"),
  condition: z.string().optional(),
});

export const UpdateAutomationTriggerSchema = CreateAutomationTriggerSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateAutomationActionSchema = z.object({
  ruleId: z.string().cuid(),
  actionType: z.nativeEnum(ActionType),
  config: z.string().min(1, "Configuração é obrigatória"),
  order: z.number().min(1),
});

export const UpdateAutomationActionSchema = CreateAutomationActionSchema.partial().extend({
  id: z.string().cuid(),
});

// Schemas de validação para Notificações
export const CreateNotificationEventSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  message: z.string().min(1, "Mensagem é obrigatória"),
  type: z.nativeEnum(NotificationType),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  userId: z.string().cuid(),
  patientId: z.string().cuid().optional(),
  dealId: z.string().cuid().optional(),
  metadata: z.string().optional(),
});

export const MarkNotificationAsReadSchema = z.object({
  notificationId: z.string().cuid(),
});

// Tipos TypeScript
export type CreateFollowUpTemplateInput = z.infer<typeof CreateFollowUpTemplateSchema>;
export type UpdateFollowUpTemplateInput = z.infer<typeof UpdateFollowUpTemplateSchema>;
export type CreateFollowUpTaskInput = z.infer<typeof CreateFollowUpTaskSchema>;
export type UpdateFollowUpTaskInput = z.infer<typeof UpdateFollowUpTaskSchema>;
export type UpdateFollowUpTaskStatusInput = z.infer<typeof UpdateFollowUpTaskStatusSchema>;
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleSchema>;
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleSchema>;
export type CreateAutomationTriggerInput = z.infer<typeof CreateAutomationTriggerSchema>;
export type UpdateAutomationTriggerInput = z.infer<typeof UpdateAutomationTriggerSchema>;
export type CreateAutomationActionInput = z.infer<typeof CreateAutomationActionSchema>;
export type UpdateAutomationActionInput = z.infer<typeof UpdateAutomationActionSchema>;
export type CreateNotificationEventInput = z.infer<typeof CreateNotificationEventSchema>;
export type MarkNotificationAsReadInput = z.infer<typeof MarkNotificationAsReadSchema>;

// Importar Priority do arquivo crm.ts
import { Priority } from './crm';