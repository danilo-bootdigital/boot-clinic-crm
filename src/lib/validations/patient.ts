import { z } from "zod";

// Validação de CPF
const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
// Telefone/WhatsApp: sem máscara nem formato fixo. Quando preenchido, aceita apenas
// dígitos (vazio também é válido). Nada de DDD/quantidade mínima — salva o valor cru.
const digitsOnlyRegex = /^\d*$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Enums do schema
export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY",
}

export enum PatientOrigin {
  GOOGLE = "GOOGLE",
  FACEBOOK = "FACEBOOK",
  INSTAGRAM = "INSTAGRAM",
  REFERRAL = "REFERRAL",
  WALK_IN = "WALK_IN",
  PHONE = "PHONE",
  WHATSAPP = "WHATSAPP",
  OTHER = "OTHER",
}

export enum PatientStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum ContactType {
  PHONE = "PHONE",
  MOBILE = "MOBILE",
  WHATSAPP = "WHATSAPP",
  EMAIL = "EMAIL",
  OTHER = "OTHER",
}

export enum DocumentType {
  RG = "RG",
  CPF = "CPF",
  CNH = "CNH",
  PASSPORT = "PASSPORT",
  HEALTH_CARD = "HEALTH_CARD",
  OTHER = "OTHER",
}

export enum TimelineEventType {
  CREATED = "CREATED",
  UPDATED = "UPDATED",
  INACTIVATED = "INACTIVATED",
  DOCUMENT_ADDED = "DOCUMENT_ADDED",
  ATTACHMENT_ADDED = "ATTACHMENT_ADDED",
  NOTE_ADDED = "NOTE_ADDED",
  APPOINTMENT_SCHEDULED = "APPOINTMENT_SCHEDULED",
  APPOINTMENT_COMPLETED = "APPOINTMENT_COMPLETED",
  INVOICE_CREATED = "INVOICE_CREATED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
}

// Schemas de validação
export const CreatePatientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf: z.string().regex(cpfRegex, "CPF inválido. Use formato: 123.456.789-00"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida. Use formato: YYYY-MM-DD"),
  gender: z.nativeEnum(Gender),
  phone: z.string().regex(digitsOnlyRegex, "Telefone deve conter apenas números").optional().or(z.literal("")),
  whatsapp: z.string().regex(digitsOnlyRegex, "WhatsApp deve conter apenas números").optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  origin: z.nativeEnum(PatientOrigin),
  status: z.nativeEnum(PatientStatus).optional().default(PatientStatus.ACTIVE),
  notes: z.string().optional(),
  contacts: z.array(z.object({
    type: z.nativeEnum(ContactType),
    value: z.string().min(1, "Valor é obrigatório"),
  })).optional(),
  addresses: z.array(z.object({
    street: z.string().min(1, "Rua é obrigatória"),
    number: z.string().optional(),
    complement: z.string().optional(),
    district: z.string().optional(),
    city: z.string().min(1, "Cidade é obrigatória"),
    state: z.string().min(1, "Estado é obrigatório"),
    zipCode: z.string().min(1, "CEP é obrigatório"),
    isMain: z.boolean().default(false),
  })).optional(),
  documents: z.array(z.object({
    type: z.nativeEnum(DocumentType),
    number: z.string().min(1, "Número é obrigatório"),
    issuer: z.string().optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
  })).optional(),
  tags: z.array(z.object({
    name: z.string().min(1, "Nome da tag é obrigatório"),
    color: z.string().optional(),
  })).optional(),
});

// Schema base para Update (sem validação extra)
const UpdatePatientSchemaBase = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  cpf: z.string().regex(cpfRegex, "CPF inválido. Use formato: 123.456.789-00"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida. Use formato: YYYY-MM-DD"),
  gender: z.nativeEnum(Gender),
  phone: z.string().regex(digitsOnlyRegex, "Telefone deve conter apenas números").optional().or(z.literal("")),
  whatsapp: z.string().regex(digitsOnlyRegex, "WhatsApp deve conter apenas números").optional().or(z.literal("")),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  origin: z.nativeEnum(PatientOrigin),
  status: z.nativeEnum(PatientStatus).optional().default(PatientStatus.ACTIVE),
  notes: z.string().optional(),
}).omit({ cpf: true });

export const UpdatePatientSchema = UpdatePatientSchemaBase.partial().extend({
  id: z.string().cuid(),
});

export const CreatePatientContactSchema = z.object({
  patientId: z.string().cuid(),
  type: z.nativeEnum(ContactType),
  value: z.string().min(1, "Valor é obrigatório"),
});

export const CreatePatientAddressSchema = z.object({
  patientId: z.string().cuid(),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().min(1, "Estado é obrigatório"),
  zipCode: z.string().min(1, "CEP é obrigatório"),
  isMain: z.boolean().default(false),
});

export const CreatePatientDocumentSchema = z.object({
  patientId: z.string().cuid(),
  type: z.nativeEnum(DocumentType),
  number: z.string().min(1, "Número é obrigatório"),
  issuer: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
});

export const CreatePatientNoteSchema = z.object({
  patientId: z.string().cuid(),
  content: z.string().min(1, "Conteúdo é obrigatório"),
});

export const CreatePatientTagSchema = z.object({
  patientId: z.string().cuid(),
  name: z.string().min(1, "Nome da tag é obrigatório"),
  color: z.string().optional(),
});

export const CreatePatientAttachmentSchema = z.object({
  patientId: z.string().cuid(),
  filename: z.string().min(1, "Nome do arquivo é obrigatório"),
  path: z.string().min(1, "Caminho do arquivo é obrigatório"),
  size: z.number().min(1, "Tamanho do arquivo é obrigatório"),
  mimeType: z.string().min(1, "Tipo MIME é obrigatório"),
});

// Tipos TypeScript
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;
export type CreatePatientContactInput = z.infer<typeof CreatePatientContactSchema>;
export type CreatePatientAddressInput = z.infer<typeof CreatePatientAddressSchema>;
export type CreatePatientDocumentInput = z.infer<typeof CreatePatientDocumentSchema>;
export type CreatePatientNoteInput = z.infer<typeof CreatePatientNoteSchema>;
export type CreatePatientTagInput = z.infer<typeof CreatePatientTagSchema>;
export type CreatePatientAttachmentInput = z.infer<typeof CreatePatientAttachmentSchema>;

// Funções utilitárias
export function validateCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = cpf.replace(/[^\d]/g, '');

  if (cleaned.length !== 11) return false;

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cleaned)) return false;

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned[9])) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned[10])) return false;

  return true;
}

export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/[^\d]/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
  }
  return cpf;
}

// Telefone/WhatsApp são exibidos EXATAMENTE como armazenados (sem máscara).
// Mantida como passthrough null-safe por compatibilidade com chamadas existentes.
export function formatPhone(phone: string | null | undefined): string {
  return phone ?? '';
}