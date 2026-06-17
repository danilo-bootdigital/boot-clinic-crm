import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { provisionBilling } from '@/lib/asaas/billing';
import { getSubscription, listSubscriptionPayments, isAsaasConfigured } from '@/lib/asaas/client';

// /api/admin/companies/[id]/billing - cobrança Asaas de uma clínica (SUPER_ADMIN).

// GET - estado da assinatura + link da fatura atual (para enviar ao cliente).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const out: any = {
      plan: company.plan,
      status: company.status,
      trialEndsAt: company.trialEndsAt,
      asaasCustomerId: company.asaasCustomerId,
      asaasSubscriptionId: company.asaasSubscriptionId,
      asaasConfigured: isAsaasConfigured(),
      subscription: null,
      invoiceUrl: null,
      lastPaymentStatus: null,
    };

    if (company.asaasSubscriptionId && isAsaasConfigured()) {
      try {
        out.subscription = await getSubscription(company.asaasSubscriptionId);
        const pays = await listSubscriptionPayments(company.asaasSubscriptionId);
        const first = pays?.data?.[0];
        out.invoiceUrl = first?.invoiceUrl || null;
        out.lastPaymentStatus = first?.status || null;
      } catch (e: any) {
        out.asaasError = e?.message || 'Falha ao consultar o Asaas';
      }
    }

    return NextResponse.json(out);
  } catch (err) {
    console.error('Erro ao consultar cobrança:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

const PostSchema = z.object({ plan: z.enum(['trial', 'basic', 'pro']) });

// POST - (re)gera/atualiza a assinatura para o plano informado (retry/upgrade).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const { plan } = PostSchema.parse(await request.json());
    const result = await provisionBilling(company.id, plan);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao gerar cobrança:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
