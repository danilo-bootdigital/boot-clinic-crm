import { z } from 'zod';

// ---------- Enums (espelham o schema Prisma) ----------
export const ANAMNESIS_QUESTION_TYPES = ['TEXT', 'TEXTAREA', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'BOOLEAN', 'NUMBER', 'DATE', 'FILE'] as const;
export const ANAMNESIS_STATUSES = ['DRAFT', 'FILLED', 'REVIEWED', 'ARCHIVED'] as const;
export const MEDICAL_RECORD_TYPES = ['EVOLUTION', 'OBSERVATION', 'HISTORY', 'PROCEDURE'] as const;
export const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'CANCELED'] as const;
export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED'] as const;
export const IMAGE_CATEGORIES = ['BEFORE', 'AFTER', 'EXAM', 'CLINICAL', 'DOCUMENT', 'OTHER'] as const;
export const DOCUMENT_CATEGORIES = ['EXAM', 'REPORT', 'CONTRACT', 'CONSENT', 'RECEIPT', 'OTHER'] as const;

// ---------- Rótulos PT-BR (para o frontend) ----------
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Texto curto', TEXTAREA: 'Texto longo', SINGLE_CHOICE: 'Escolha única',
  MULTIPLE_CHOICE: 'Múltipla escolha', BOOLEAN: 'Sim/Não', NUMBER: 'Número', DATE: 'Data', FILE: 'Arquivo',
};
export const ANAMNESIS_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho', FILLED: 'Preenchida', REVIEWED: 'Revisada', ARCHIVED: 'Arquivada',
};
export const RECORD_TYPE_LABELS: Record<string, string> = {
  EVOLUTION: 'Evolução clínica', OBSERVATION: 'Observação interna', HISTORY: 'Histórico', PROCEDURE: 'Procedimento',
};
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', SIGNED: 'Assinado', CANCELED: 'Cancelado',
};
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho', SENT: 'Enviado', APPROVED: 'Aprovado', REJECTED: 'Recusado',
};
export const IMAGE_CATEGORY_LABELS: Record<string, string> = {
  BEFORE: 'Antes', AFTER: 'Depois', EXAM: 'Exame', CLINICAL: 'Clínica', DOCUMENT: 'Documento', OTHER: 'Outro',
};
export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  EXAM: 'Exame', REPORT: 'Laudo', CONTRACT: 'Contrato', CONSENT: 'Termo de consentimento', RECEIPT: 'Recibo', OTHER: 'Outro',
};

// ---------- Anamnese ----------
export const AnamnesisQuestionInput = z.object({
  label: z.string().min(1, 'Pergunta é obrigatória'),
  type: z.enum(ANAMNESIS_QUESTION_TYPES).default('TEXT'),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const CreateAnamnesisTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  specialty: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  questions: z.array(AnamnesisQuestionInput).optional(),
});

export const CreatePatientAnamnesisSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  templateId: z.string().optional(),
  // Texto livre — sem limite artificial de caracteres.
  notes: z.string().optional(),
  status: z.enum(ANAMNESIS_STATUSES).optional(),
  answers: z.array(z.object({
    questionId: z.string().optional(),
    label: z.string().min(1),
    value: z.string().optional(),
    fileUrl: z.string().optional(),
  })).optional(),
});

export const UpdatePatientAnamnesisSchema = z.object({
  title: z.string().min(1).optional(),
  // Texto livre — sem limite artificial. `null` limpa o campo; ausência preserva.
  notes: z.string().nullable().optional(),
  status: z.enum(ANAMNESIS_STATUSES).optional(),
  answers: z.array(z.object({
    questionId: z.string().optional(),
    label: z.string().min(1),
    value: z.string().optional(),
    fileUrl: z.string().optional(),
  })).optional(),
});

// ---------- Prontuário ----------
export const CreateMedicalRecordSchema = z.object({
  type: z.enum(MEDICAL_RECORD_TYPES).default('EVOLUTION'),
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  professionalId: z.string().optional(),
});

export const UpdateMedicalRecordSchema = z.object({
  type: z.enum(MEDICAL_RECORD_TYPES).optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  professionalId: z.string().optional().nullable(),
});

// ---------- Contratos ----------
export const CreateContractTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  isActive: z.boolean().optional(),
});

export const CreatePatientContractSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  templateId: z.string().optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  variables: z.record(z.any()).optional(),
  value: z.number().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
});

export const UpdatePatientContractSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  variables: z.record(z.any()).optional(),
  value: z.number().optional().nullable(),
  status: z.enum(CONTRACT_STATUSES).optional(),
});

// ---------- Orçamentos ----------
export const QuoteItemInput = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0).default(0),
});

export const CreateClinicalQuoteSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  status: z.enum(QUOTE_STATUSES).optional(),
  discount: z.number().min(0).optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(QuoteItemInput).optional(),
});

export const UpdateClinicalQuoteSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  discount: z.number().min(0).optional(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(QuoteItemInput).optional(),
});

// ---------- Resolve variáveis de contrato ----------
// Substitui {{chave}} no corpo pelos valores fornecidos.
export function renderContractContent(content: string, vars: Record<string, any>): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

// Variáveis dinâmicas disponíveis (para a UI mostrar como dica).
export const CONTRACT_VARIABLES = [
  'nome_paciente', 'cpf', 'procedimento', 'valor', 'profissional', 'clinica', 'data',
] as const;
