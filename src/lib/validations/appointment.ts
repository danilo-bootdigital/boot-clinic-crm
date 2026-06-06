import { z } from "zod";

// Enums do schema Agenda
export enum AppointmentStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELED = "CANCELED",
  RESCHEDULED = "RESCHEDULED",
  ATTENDED = "ATTENDED",
  NO_SHOW = "NO_SHOW",
}

export enum ReminderType {
  EMAIL = "EMAIL",
  SMS = "SMS",
  WHATSAPP = "WHATSAPP",
  PUSH = "PUSH",
}

// Schemas de validação
export const CreateSpecialtySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
});

export const UpdateSpecialtySchema = CreateSpecialtySchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateProfessionalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  crm: z.string().optional(),
  phone: z.string().min(1, "Telefone é obrigatório"),
  email: z.string().email("E-mail inválido").optional(),
  clinicId: z.string().cuid(),
  specialtyIds: z.array(z.string().cuid()).min(1, "É necessário pelo menos uma especialidade"),
});

export const UpdateProfessionalSchema = CreateProfessionalSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateRoomSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  clinicId: z.string().cuid(),
});

export const UpdateRoomSchema = CreateRoomSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateAppointmentTypeSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  duration: z.number().min(5, "Duração mínima de 5 minutos").max(480, "Duração máxima de 8 horas"),
  clinicId: z.string().cuid(),
});

export const UpdateAppointmentTypeSchema = CreateAppointmentTypeSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateProfessionalScheduleSchema = z.object({
  professionalId: z.string().cuid(),
  dayOfWeek: z.number().min(0).max(6, "Dia inválido (0-6)"),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato HH:mm inválido"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato HH:mm inválido"),
});

export const UpdateProfessionalScheduleSchema = CreateProfessionalScheduleSchema.partial().extend({
  id: z.string().cuid(),
  isActive: z.boolean().optional(),
});

export const CreateScheduleBlockSchema = z.object({
  professionalId: z.string().cuid(),
  date: z.string().datetime(),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato HH:mm inválido"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato HH:mm inválido"),
  reason: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringPattern: z.enum(["daily", "weekly", "monthly"]).optional(),
});

export const UpdateScheduleBlockSchema = CreateScheduleBlockSchema.partial().extend({
  id: z.string().cuid(),
});

export const CreateAppointmentSchema = z.object({
  patientId: z.string().cuid(),
  professionalId: z.string().cuid(),
  specialtyId: z.string().cuid(),
  roomId: z.string().cuid().optional(),
  type: z.string().min(1, "Tipo é obrigatório"),
  startAt: z.string().datetime(),
  durationMinutes: z.number().min(5).max(480),
  source: z.string().min(1, "Origem é obrigatória"),
  notes: z.string().optional(),
  dealId: z.string().cuid().optional(),
  clinicId: z.string().cuid(),
});

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial().extend({
  id: z.string().cuid(),
});

export const ConfirmAppointmentSchema = z.object({
  id: z.string().cuid(),
  notes: z.string().optional(),
});

export const CancelAppointmentSchema = z.object({
  id: z.string().cuid(),
  cancellationReason: z.string().min(1, "Motivo do cancelamento é obrigatório"),
  notes: z.string().optional(),
});

export const RescheduleAppointmentSchema = z.object({
  id: z.string().cuid(),
  newStartAt: z.string().datetime(),
  newDurationMinutes: z.number().min(5).max(480),
  notes: z.string().optional(),
});

export const MarkAppointmentAttendedSchema = z.object({
  id: z.string().cuid(),
  notes: z.string().optional(),
});

export const MarkAppointmentNoShowSchema = z.object({
  id: z.string().cuid(),
  notes: z.string().optional(),
});

export const CreateAppointmentReminderSchema = z.object({
  appointmentId: z.string().cuid(),
  type: z.nativeEnum(ReminderType),
  sendAt: z.string().datetime(),
});

// Tipos TypeScript
export type CreateSpecialtyInput = z.infer<typeof CreateSpecialtySchema>;
export type UpdateSpecialtyInput = z.infer<typeof UpdateSpecialtySchema>;
export type CreateProfessionalInput = z.infer<typeof CreateProfessionalSchema>;
export type UpdateProfessionalInput = z.infer<typeof UpdateProfessionalSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;
export type CreateAppointmentTypeInput = z.infer<typeof CreateAppointmentTypeSchema>;
export type UpdateAppointmentTypeInput = z.infer<typeof UpdateAppointmentTypeSchema>;
export type CreateProfessionalScheduleInput = z.infer<typeof CreateProfessionalScheduleSchema>;
export type UpdateProfessionalScheduleInput = z.infer<typeof UpdateProfessionalScheduleSchema>;
export type CreateScheduleBlockInput = z.infer<typeof CreateScheduleBlockSchema>;
export type UpdateScheduleBlockInput = z.infer<typeof UpdateScheduleBlockSchema>;
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type ConfirmAppointmentInput = z.infer<typeof ConfirmAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentSchema>;
export type MarkAppointmentAttendedInput = z.infer<typeof MarkAppointmentAttendedSchema>;
export type MarkAppointmentNoShowInput = z.infer<typeof MarkAppointmentNoShowSchema>;
export type CreateAppointmentReminderInput = z.infer<typeof CreateAppointmentReminderSchema>;

// Funções utilitárias
export function validateDateTimeRange(startAt: string, endAt: string): boolean {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return end > start;
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Não é sábado nem domingo
}

export function isWithinBusinessHours(date: Date, startTime: string, endTime: string): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  const currentTime = hours * 60 + minutes;
  const startTimeMinutes = startHour * 60 + startMinute;
  const endTimeMinutes = endHour * 60 + endMinute;

  return currentTime >= startTimeMinutes && currentTime <= endTimeMinutes;
}