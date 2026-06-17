// Catálogo de planos do SaaS. Valores mensais em BRL.
// Ajuste aqui (ou via env) quando os preços mudarem.

export type PlanKey = 'trial' | 'basic' | 'pro';

export interface Plan {
  key: PlanKey;
  label: string;
  value: number; // mensalidade em reais
  paid: boolean; // se gera assinatura no Asaas
}

export const PLANS: Record<PlanKey, Plan> = {
  trial: { key: 'trial', label: 'Trial (grátis)', value: 0, paid: false },
  basic: { key: 'basic', label: 'Basic', value: Number(process.env.ASAAS_PLAN_BASIC || 197), paid: true },
  pro: { key: 'pro', label: 'Pro', value: Number(process.env.ASAAS_PLAN_PRO || 397), paid: true },
};

// Dias de teste antes da 1ª cobrança (vale tanto para o plano "trial" puro
// quanto para o período de carência dos planos pagos).
export const TRIAL_DAYS = Number(process.env.ASAAS_TRIAL_DAYS || 14);

export function isPlanKey(v: unknown): v is PlanKey {
  return v === 'trial' || v === 'basic' || v === 'pro';
}

export function getPlan(key: string | null | undefined): Plan | null {
  return key && isPlanKey(key) ? PLANS[key] : null;
}
