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
    // Se o token estiver configurado, exige correspondência. (Sem token configurado,
    // aceita — útil em setup inicial, mas recomenda-se sempre configurar.)
    if (expected && token !== expected) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const event: string | undefined = body?.event;
    const payment = body?.payment;
    if (!event || !payment) {
      return NextResponse.json({ received: true, ignored: 'payload sem event/payment' });
    }

    // Localiza a clínica pela assinatura (ou cliente) do Asaas.
    const company = await prisma.company.findFirst({
      where: {
        deletedAt: null,
        OR: [
          payment.subscription ? { asaasSubscriptionId: String(payment.subscription) } : undefined,
          payment.customer ? { asaasCustomerId: String(payment.customer) } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (!company) {
      // 200 para o Asaas não reenviar indefinidamente; logamos para auditoria.
      console.warn('[asaas webhook] clínica não encontrada para', { event, subscription: payment.subscription, customer: payment.customer });
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
