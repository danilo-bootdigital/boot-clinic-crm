import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { CompanyStatus } from '@prisma/client';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelSubscription, isAsaasConfigured } from '@/lib/asaas/client';

// /api/admin/companies/[id] - detalhe e atualização de uma clínica (SUPER_ADMIN).

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  plan: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELED']).optional(),
});

// GET /api/admin/companies/[id] - detalhe com contadores e usuários da clínica.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        users: {
          where: { deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { patients: { where: { deletedAt: null } } } },
      },
    });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    return NextResponse.json({
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      phone: company.phone,
      email: company.email,
      status: company.status,
      plan: company.plan,
      trialEndsAt: company.trialEndsAt,
      createdAt: company.createdAt,
      patientsCount: company._count.patients,
      users: company.users,
    });
  } catch (err) {
    console.error('Erro ao buscar clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PATCH /api/admin/companies/[id] - atualiza dados/plano/status (ativar, suspender...).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const exists = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!exists) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());
    const company = await prisma.company.update({
      where: { id: params.id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.cnpj !== undefined && { cnpj: d.cnpj || null }),
        ...(d.phone !== undefined && { phone: d.phone || null }),
        ...(d.email !== undefined && { email: d.email || null }),
        ...(d.plan !== undefined && { plan: d.plan || null }),
        ...(d.status !== undefined && { status: d.status as CompanyStatus }),
      },
      select: { id: true, name: true, status: true, plan: true },
    });
    return NextResponse.json(company);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/admin/companies/[id] - offboarding: encerra a clínica.
// Soft-delete da clínica + soft-delete de todos os seus usuários (liberando os
// e-mails) + remoção das contas no Supabase Auth. Operação irreversível na prática.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    // Proteção: o super-admin não pode encerrar a própria clínica (evita lockout).
    if (params.id === dbUser!.companyId) {
      return NextResponse.json({ error: 'Você não pode encerrar a sua própria clínica' }, { status: 400 });
    }

    const company = await prisma.company.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { users: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    // Cancela a assinatura no Asaas (se existir) — encerra a cobrança recorrente.
    if (company.asaasSubscriptionId && isAsaasConfigured()) {
      await cancelSubscription(company.asaasSubscriptionId).catch((e) =>
        console.warn('[asaas] falha ao cancelar assinatura no offboarding:', e?.message)
      );
    }

    // Remove as contas de acesso no Supabase Auth (se a service key existir).
    const admin = createAdminClient();
    if (admin) {
      for (const u of company.users) {
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Libera os e-mails (unique) para permitir recadastro futuro.
      for (const u of company.users) {
        await tx.user.update({
          where: { id: u.id },
          data: { deletedAt: now, email: `removido_${u.id}@deleted.local` },
        });
      }
      await tx.company.update({
        where: { id: params.id },
        data: { deletedAt: now, status: CompanyStatus.CANCELED },
      });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao encerrar clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
