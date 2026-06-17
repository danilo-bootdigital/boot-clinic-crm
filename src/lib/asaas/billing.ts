import { prisma } from '@/lib/db/prisma';
import { createCustomer, createSubscription, listSubscriptionPayments, isAsaasConfigured } from './client';
import { getPlan, TRIAL_DAYS } from './plans';
import { CompanyStatus } from '@prisma/client';

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export interface ProvisionResult {
  paid: boolean;
  invoiceUrl: string | null;
  subscriptionId?: string | null;
  warning?: string; // preenchido quando a cobrança não pôde ser criada (não bloqueia o cadastro)
}

// Provisiona a cobrança de uma clínica conforme o plano:
// - trial: sem assinatura no Asaas; status TRIAL + trialEndsAt.
// - basic/pro: cria cliente + assinatura (cartão, mensal) com 1ª cobrança após o
//   trial; status TRIAL até o 1º pagamento confirmado (webhook → ACTIVE). Devolve
//   o invoiceUrl da 1ª fatura para enviar ao cliente cadastrar o cartão.
//
// Falha de Asaas NÃO derruba o cadastro da clínica: devolve { warning } e mantém
// a clínica em TRIAL para retry posterior (POST .../billing).
export async function provisionBilling(companyId: string, planKey: string): Promise<ProvisionResult> {
  const plan = getPlan(planKey);
  if (!plan) throw new Error('Plano inválido');

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('Clínica não encontrada');

  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  // Plano gratuito (trial puro): sem assinatura.
  if (!plan.paid) {
    await prisma.company.update({
      where: { id: companyId },
      data: { plan: plan.key, status: CompanyStatus.TRIAL, trialEndsAt: trialEnds, asaasSubscriptionId: null },
    });
    return { paid: false, invoiceUrl: null };
  }

  // Planos pagos exigem Asaas configurado e CNPJ (cpfCnpj do cliente no Asaas).
  if (!isAsaasConfigured()) {
    await prisma.company.update({
      where: { id: companyId },
      data: { plan: plan.key, status: CompanyStatus.TRIAL, trialEndsAt: trialEnds },
    });
    return { paid: true, invoiceUrl: null, warning: 'Asaas não configurado: assinatura não criada (configure ASAAS_API_KEY e gere a cobrança depois).' };
  }
  if (!company.cnpj) {
    return { paid: true, invoiceUrl: null, warning: 'CNPJ é obrigatório para criar a assinatura no Asaas.' };
  }

  try {
    // Reaproveita o cliente Asaas se já existir.
    let customerId = company.asaasCustomerId;
    if (!customerId) {
      const customer = await createCustomer({
        name: company.name,
        cpfCnpj: company.cnpj,
        email: company.email,
        mobilePhone: company.phone,
        externalReference: company.id,
      });
      customerId = customer.id;
    }

    const sub = await createSubscription({
      customer: customerId!,
      value: plan.value,
      nextDueDate: ymd(trialEnds),
      description: `Assinatura Boot Clinic CRM — ${plan.label}`,
      externalReference: company.id,
    });

    // 1ª fatura → invoiceUrl (cliente paga e tokeniza o cartão).
    let invoiceUrl: string | null = null;
    try {
      const pays = await listSubscriptionPayments(sub.id);
      invoiceUrl = pays?.data?.[0]?.invoiceUrl || null;
    } catch { /* sem fatura ainda; o cliente recebe por e-mail do Asaas */ }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan: plan.key,
        status: CompanyStatus.TRIAL,
        trialEndsAt: trialEnds,
        asaasCustomerId: customerId,
        asaasSubscriptionId: sub.id,
      },
    });

    return { paid: true, invoiceUrl, subscriptionId: sub.id };
  } catch (err: any) {
    // Mantém a clínica em TRIAL e devolve aviso para retry.
    await prisma.company.update({
      where: { id: companyId },
      data: { plan: plan.key, status: CompanyStatus.TRIAL, trialEndsAt: trialEnds },
    }).catch(() => {});
    return { paid: true, invoiceUrl: null, warning: `Falha ao criar assinatura no Asaas: ${err?.message || 'erro desconhecido'}` };
  }
}
