import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { CompanyStatus } from '@prisma/client';

// Webhook do Asaas — rota PÚBLICA (Asaas não tem sessão Supabase). A autenticação
// é o token configurado no painel do Asaas, enviado no header `asaas-access-token`
// e comparado com ASAAS_WEBHOOK_TOKEN. Mapeia eventos de pagamento para o status
// da assinatura da clínica: pago → ACTIVE, vencido/estornado → SUSPENDED.
//
// Configurar em Asaas → Integrações → Webhooks:
//   URL: https://<seu-domínio>/api/asaas/webhook
//   Token de autenticação: o mesmo valor de ASAAS_WEBHOOK_TOKEN.

const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH']);
const BLOCK_EVENTS = new Set([
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_DELETED',
]);

export async function POST(request: NextRequest) {
  try {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const token = request.headers.get('asaas-access-token');
    // Fail-closed: sem ASAAS_WEBHOOK_TOKEN configurado, OU token divergente,
    // rejeita. Endpoint público que muda estado de assinatura NÃO pode ser
    // fail-open (senão um POST forjado suspende/ativa qualquer clínica).
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const event: string | undefined = body?.event;
    const payment = body?.payment;
    if (!event || !payment) {
      return NextResponse.json({ received: true, ignored: 'payload sem event/payment' });
    }

    // Casa a clínica APENAS pela assinatura do SaaS (asaasSubscriptionId).
    // NÃO casar por asaasCustomerId: um pagamento avulso/antigo do mesmo cliente
    // mudaria o status da assinatura indevidamente (pagamento errado).
    if (!payment.subscription) {
      return NextResponse.json({ received: true, ignored: 'pagamento sem assinatura (não é a assinatura do SaaS)' });
    }
    const company = await prisma.company.findFirst({
      where: { deletedAt: null, asaasSubscriptionId: String(payment.subscription) },
    });

    if (!company) {
      // 200 para o Asaas não reenviar indefinidamente; logamos para auditoria.
      console.warn('[asaas webhook] clínica não encontrada para', { event, subscription: payment.subscription });
      return NextResponse.json({ received: true, matched: false });
    }

    let newStatus: CompanyStatus | null = null;
    if (PAID_EVENTS.has(event)) newStatus = CompanyStatus.ACTIVE;
    else if (BLOCK_EVENTS.has(event)) newStatus = CompanyStatus.SUSPENDED;

    if (newStatus && company.status !== newStatus) {
      await prisma.company.update({ where: { id: company.id }, data: { status: newStatus } });
      console.log(`[asaas webhook] ${event} → clínica ${company.id} status ${company.status} → ${newStatus}`);
    }

    return NextResponse.json({ received: true, matched: true, status: newStatus || company.status });
  } catch (err) {
    console.error('[asaas webhook] erro:', err);
    // 200 mesmo em erro interno evita reenvios em loop; o log permite reprocessar.
    return NextResponse.json({ received: true, error: true });
  }
}
