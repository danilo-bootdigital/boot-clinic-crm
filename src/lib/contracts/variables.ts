// Variáveis do contrato montadas a partir do CADASTRO do paciente e da clínica.
//
// O contrato precisa carregar os dados completos de quem assina. Montar isso no
// servidor (e não no navegador a partir do que a tela tiver em memória) garante
// que o texto saia com o cadastro atual — inclusive campos que a tela de
// contratos não exibe, como endereço e convênio.

const GENDER_LABEL: Record<string, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
  OTHER: 'Outro',
  PREFER_NOT_TO_SAY: 'Não informado',
};

const TZ = 'America/Sao_Paulo';

export function formatCpf(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 11) return raw || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCnpj(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length !== 14) return raw || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatPhone(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || '';
}

function formatCep(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : raw || '';
}

// birthDate é gravado como meia-noite UTC: formatar em UTC evita que o
// aniversário apareça um dia antes no fuso de São Paulo.
function formatBirth(d?: Date | string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function ageOn(birth: Date | string | null | undefined, now: Date): string {
  if (!birth) return '';
  const b = new Date(birth);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age >= 0 ? String(age) : '';
}

export function formatBRL(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface ContractPatientData {
  name: string;
  cpf: string;
  birthDate?: Date | string | null;
  gender?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  insurance?: string | null;
  insuranceNumber?: string | null;
}

export interface ContractCompanyData {
  name: string;
  cnpj?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface ContractExtra {
  procedure?: string | null;
  value?: number | null;
  professional?: string | null;
}

export function buildContractVariables(
  patient: ContractPatientData,
  company: ContractCompanyData,
  extra: ContractExtra = {},
  now: Date = new Date(),
): Record<string, string> {
  const cidadeUf = [patient.city, patient.state].filter(Boolean).join('/');
  const enderecoCompleto = [patient.address, cidadeUf, patient.zipCode ? `CEP ${formatCep(patient.zipCode)}` : '']
    .filter(Boolean)
    .join(', ');

  return {
    // Paciente
    nome_paciente: patient.name,
    cpf: formatCpf(patient.cpf),
    data_nascimento: formatBirth(patient.birthDate),
    idade: ageOn(patient.birthDate, now),
    sexo: patient.gender ? GENDER_LABEL[patient.gender] ?? '' : '',
    telefone: formatPhone(patient.phone),
    whatsapp: formatPhone(patient.whatsapp || patient.phone),
    email: patient.email || '',
    endereco: patient.address || '',
    cidade: patient.city || '',
    estado: patient.state || '',
    cep: formatCep(patient.zipCode),
    endereco_completo: enderecoCompleto,
    convenio: patient.insurance || '',
    numero_convenio: patient.insuranceNumber || '',
    // Clínica
    clinica: company.name,
    cnpj_clinica: formatCnpj(company.cnpj),
    endereco_clinica: company.address || '',
    telefone_clinica: formatPhone(company.phone),
    email_clinica: company.email || '',
    // Do atendimento
    procedimento: extra.procedure || '',
    valor: formatBRL(extra.value),
    profissional: extra.professional || '',
    data: now.toLocaleDateString('pt-BR', { timeZone: TZ }),
    data_extenso: now.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

// Dica para quem escreve o modelo: o que existe e de onde vem.
export const CONTRACT_VARIABLE_GROUPS: { label: string; keys: { key: string; hint: string }[] }[] = [
  {
    label: 'Paciente (do cadastro)',
    keys: [
      { key: 'nome_paciente', hint: 'Nome completo' },
      { key: 'cpf', hint: 'CPF formatado' },
      { key: 'data_nascimento', hint: 'dd/mm/aaaa' },
      { key: 'idade', hint: 'Idade em anos' },
      { key: 'sexo', hint: 'Sexo' },
      { key: 'telefone', hint: 'Telefone' },
      { key: 'whatsapp', hint: 'WhatsApp' },
      { key: 'email', hint: 'E-mail' },
      { key: 'endereco', hint: 'Rua, número, bairro' },
      { key: 'cidade', hint: 'Cidade' },
      { key: 'estado', hint: 'UF' },
      { key: 'cep', hint: 'CEP' },
      { key: 'endereco_completo', hint: 'Endereço + cidade/UF + CEP' },
      { key: 'convenio', hint: 'Convênio' },
      { key: 'numero_convenio', hint: 'Nº da carteirinha' },
    ],
  },
  {
    label: 'Clínica',
    keys: [
      { key: 'clinica', hint: 'Nome da clínica' },
      { key: 'cnpj_clinica', hint: 'CNPJ' },
      { key: 'endereco_clinica', hint: 'Endereço' },
      { key: 'telefone_clinica', hint: 'Telefone' },
      { key: 'email_clinica', hint: 'E-mail' },
    ],
  },
  {
    label: 'Atendimento (preenchido ao gerar)',
    keys: [
      { key: 'procedimento', hint: 'Procedimento' },
      { key: 'valor', hint: 'Valor em R$' },
      { key: 'profissional', hint: 'Profissional' },
      { key: 'data', hint: 'Data de hoje' },
      { key: 'data_extenso', hint: 'ex.: 5 de outubro de 2026' },
    ],
  },
];

/** Variáveis que sobraram sem valor no texto final — a tela avisa antes de gerar. */
export function unresolvedVariables(content: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.add(m[1]);
  return Array.from(out);
}
