// Cliente da API do Asaas (cobrança recorrente). SOMENTE no servidor.
//
// Auth: header `access_token`. Base padrão = produção (https://api.asaas.com/v3);
// override por ASAAS_API_URL (ex.: sandbox). Sem ASAAS_API_KEY, isAsaasConfigured()
// devolve false e as rotas respondem de forma amigável (não quebram o cadastro).

const API_URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';
const API_KEY = process.env.ASAAS_API_KEY || '';

export function isAsaasConfigured() {
  return !!API_KEY;
}

export class AsaasError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'AsaasError';
    this.status = status;
    this.body = body;
  }
}

async function asaasFetch(path: string, init: RequestInit = {}) {
  if (!API_KEY) throw new AsaasError('ASAAS_API_KEY não configurada', 503, null);
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: API_KEY,
      'User-Agent': 'BootClinicCRM',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok) {
    // Asaas devolve { errors: [{ code, description }] }
    const desc = json?.errors?.[0]?.description || json?.message || `Asaas ${res.status}`;
    throw new AsaasError(desc, res.status, json);
  }
  return json;
}

export interface AsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference?: string; // companyId
}

export async function createCustomer(input: AsaasCustomerInput) {
  return asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
      email: input.email || undefined,
      mobilePhone: input.mobilePhone ? input.mobilePhone.replace(/\D/g, '') : undefined,
      externalReference: input.externalReference,
    }),
  });
}

export async function deleteCustomer(id: string) {
  return asaasFetch(`/customers/${id}`, { method: 'DELETE' });
}

export interface AsaasSubscriptionInput {
  customer: string; // asaas customer id
  value: number;
  nextDueDate: string; // YYYY-MM-DD (1ª cobrança; usar trial p/ empurrar)
  description?: string;
  externalReference?: string; // companyId
}

// Assinatura recorrente mensal no cartão. Não enviamos dados de cartão: o Asaas
// gera a 1ª fatura com invoiceUrl; o cliente paga lá (cartão é tokenizado) e os
// ciclos seguintes são cobrados automaticamente.
export async function createSubscription(input: AsaasSubscriptionInput) {
  return asaasFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customer,
      billingType: 'CREDIT_CARD',
      cycle: 'MONTHLY',
      value: input.value,
      nextDueDate: input.nextDueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
}

export async function cancelSubscription(id: string) {
  return asaasFetch(`/subscriptions/${id}`, { method: 'DELETE' });
}

export async function getSubscription(id: string) {
  return asaasFetch(`/subscriptions/${id}`, { method: 'GET' });
}

// Pagamentos de uma assinatura (a 1ª fatura traz invoiceUrl p/ enviar ao cliente).
export async function listSubscriptionPayments(id: string) {
  return asaasFetch(`/subscriptions/${id}/payments`, { method: 'GET' });
}
