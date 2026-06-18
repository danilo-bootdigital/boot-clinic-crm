import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { UserRole } from '@prisma/client';
import { payableCan, payableModuleLevel, type FinanceCapability } from '@/lib/financial-caps';

// RBAC do Contas a Pagar — regra pura em lib/financial-caps (payableCan).
export { payableCan, payableModuleLevel };

type U = { role: UserRole };

export function requirePayableCap(user: U, cap: FinanceCapability) {
  return payableCan(user.role, cap)
    ? null
    : NextResponse.json({ error: 'Sem permissão para Contas a Pagar' }, { status: 403 });
}

// Resolve usuário + assinatura + módulo 'financeiro' + capacidade de Contas a Pagar.
export async function resolvePayableUser(cap: FinanceCapability) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: { select: { status: true, plan: true } } },
  });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  const moduleOff = await requireModuleEnabled(dbUser, 'financeiro');
  if (moduleOff) return { error: moduleOff };

  const denied = requirePayableCap(dbUser, cap);
  if (denied) return { error: denied };

  return { dbUser };
}
