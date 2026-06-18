import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { UserRole } from '@prisma/client';
import { financialCan, financialModuleLevel, type FinanceCapability } from '@/lib/financial-caps';

// RBAC do Módulo Financeiro — a regra (por CAPACIDADE) vive em lib/financial-caps
// (pura/client-safe). Aqui ficam só os wrappers de servidor (auth + escopo + 403).
export { financialCan, financialModuleLevel };
export type { FinanceCapability };

type U = { role: UserRole };

// 403 se o usuário não tem a capacidade; senão null.
export function requireFinanceCap(user: U, cap: FinanceCapability) {
  return financialCan(user.role, cap)
    ? null
    : NextResponse.json({ error: 'Sem permissão para esta ação financeira' }, { status: 403 });
}

// Resolve usuário + bloqueio de assinatura + módulo habilitado + capacidade.
// Drop-in nas rotas: `const { dbUser, error } = await resolveFinanceUser('settle')`.
export async function resolveFinanceUser(cap: FinanceCapability) {
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

  const denied = requireFinanceCap(dbUser, cap);
  if (denied) return { error: denied };

  return { dbUser };
}
