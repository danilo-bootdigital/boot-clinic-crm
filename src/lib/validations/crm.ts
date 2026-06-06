import { z } from "zod";

// Enums do schema CRM
export enum PipelineStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum FinalType {
  WON = "WON",
  LOST = "LOST",
  NONE = "NONE",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum DealStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  IN_NEGOTIATION = "IN_NEGOTIATION",
  APPOINTMENT_SCHEDULED = "APPOINTMENT_SCHEDULED",
  APPOINTMENT_ATTENDED = "APPOINTMENT_ATTENDED",
  QUOTE_SENT = "QUOTE_SENT",
  WON = "WON",
  LOST = "LOST",
}

export enum DealSource {
  WEBSITE = "WEBSITE",
  REFERRAL = "REFERRAL",
  PHONE = "PHONE",
  WHATSAPP = "WHATSAPP",
  SOCIAL_MEDIA = "SOCIAL_MEDIA",
  WALK_IN = "WALK_IN",
  EMAIL = "EMAIL",
  OTHER = "OTHER",
}

export enum ActivityType {
  CREATED = "CREATED",
  MOVED_STAGE = "MOVED_STAGE",
  FOLLOW_UP_CREATED = "FOLLOW_UP_CREATED",
  FOLLOW_UP_COMPLETED = "FOLLOW_UP_COMPLETED",
  NOTE_ADDED = "NOTE_ADDED",
  TASK_CREATED = "TASK_CREATED",
  TASK_COMPLETED = "TASK_COMPLETED",
  WON = "WON",
  LOST = "LOST",
}

// Schemas de validação
export const CreatePipelineSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  clinicId: z.string().cuid(),
  isDefault: z.boolean().default(false),
  status: z.nativeEnum(PipelineStatus).default(PipelineStatus.ACTIVE),
});

export const UpdatePipelineSchema = CreatePipelineSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreatePipelineStageSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  pipelineId: z.string().cuid(),
  order: z.number().min(1),
  color: z.string().min(1, "Cor é obrigatória"),
  probability: z.number().min(0).max(100).optional(),
  isFinal: z.boolean().default(false),
  finalType: z.nativeEnum(FinalType).default(FinalType.NONE),
});

export const UpdatePipelineStageSchema = CreatePipelineStageSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateDealSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  valueEstimated: z.number().positive().optional(),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  pipelineId: z.string().cuid(),
  stageId: z.string().cuid(),
  patientId: z.string().cuid().optional(),
  source: z.nativeEnum(DealSource),
  responsibleUserId: z.string().cuid(),
  nextFollowUpAt: z.string().optional(),
  lastContactAt: z.string().optional(),
});

export const UpdateDealSchema = CreateDealSchema.partial().extend({
  id: z.string().cuid(),
});

export const MoveDealSchema = z.object({
  dealId: z.string().cuid(),
  newStageId: z.string().cuid(),
  notes: z.string().optional(),
});

export const CreateDealActivitySchema = z.object({
  dealId: z.string().cuid(),
  type: z.nativeEnum(ActivityType),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
});

export const CreateDealNoteSchema = z.object({
  dealId: z.string().cuid(),
  content: z.string().min(1, "Conteúdo é obrigatório"),
});

export const CreateDealTaskSchema = z.object({
  dealId: z.string().cuid(),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  assignedToId: z.string().cuid().optional(),
});

export const MarkDealWonSchema = z.object({
  dealId: z.string().cuid(),
  notes: z.string().optional(),
});

export const MarkDealLostSchema = z.object({
  dealId: z.string().cuid(),
  lossReasonId: z.string().cuid(),
  notes: z.string().optional(),
});

export const CreateDealSourceSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

export const CreateDealLossReasonSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
});

// Tipos TypeScript
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreatePipelineStageInput = z.infer<typeof CreatePipelineStageSchema>;
export type UpdatePipelineStageInput = z.infer<typeof UpdatePipelineStageSchema>;
export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type MoveDealInput = z.infer<typeof MoveDealSchema>;
export type CreateDealActivityInput = z.infer<typeof CreateDealActivitySchema>;
export type CreateDealNoteInput = z.infer<typeof CreateDealNoteSchema>;
export type CreateDealTaskInput = z.infer<typeof CreateDealTaskSchema>;
export type MarkDealWonInput = z.infer<typeof MarkDealWonSchema>;
export type MarkDealLostInput = z.infer<typeof MarkDealLostSchema>;
export type CreateDealSourceInput = z.infer<typeof CreateDealSourceSchema>;
export type CreateDealLossReasonInput = z.infer<typeof CreateDealLossReasonSchema>;

// Funções utilitárias
export function getDefaultStages(): { name: string; order: number; color: string; isFinal: boolean; finalType: FinalType }[] {
  return [
    { name: "Lead novo", order: 1, color: "#3B82F6", isFinal: false, finalType: FinalType.NONE },
    { name: "Contato iniciado", order: 2, color: "#8B5CF6", isFinal: false, finalType: FinalType.NONE },
    { name: "Em negociação", order: 3, color: "#F59E0B", isFinal: false, finalType: FinalType.NONE },
    { name: "Consulta agendada", order: 4, color: "#10B981", isFinal: false, finalType: FinalType.NONE },
    { name: "Compareceu", order: 5, color: "#06B6D4", isFinal: false, finalType: FinalType.NONE },
    { name: "Orçamento enviado", order: 6, color: "#8B5CF6", isFinal: false, finalType: FinalType.NONE },
    { name: "Fechado", order: 7, color: "#10B981", isFinal: true, finalType: FinalType.WON },
    { name: "Perdido", order: 8, color: "#EF4444", isFinal: true, finalType: FinalType.LOST },
  ];
}