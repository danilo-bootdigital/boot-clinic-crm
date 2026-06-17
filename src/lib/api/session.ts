import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole, CompanyStatus } from '@prisma/client';

// Resolve o usuário do banco a partir da sessão Supabase, devolvendo o escopo
// de empresa. Retorna { error } pronto para responder quando não autenticado.
//
// Bloqueio de assinatura (SaaS): se a clínica do usuário estiver SUSPENDED ou
// CANCELED, qualquer usuário NÃO super-admin recebe 403 — vale para todos os
// módulos de uma vez, sem precisar checar em cada rota. O SUPER_ADMIN sempre
// passa (precisa administrar inclusive clínicas suspensas).
export async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: { select: { status: true } } },
  });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };
  return { dbUser };
}

// Bloqueio de assinatura: 403 se a clínica do usuário está SUSPENDED/CANCELED.
// SUPER_ADMIN sempre passa. Reusa `company.status` se já carregado; senão consulta.
// Usado tanto pelo resolveDbUser quanto pelas rotas que resolvem o usuário "na mão".
export async function subscriptionBlock(dbUser: {
  role: UserRole;
  companyId?: string;
  company?: { status: CompanyStatus } | null;
}) {
  if (dbUser.role === UserRole.SUPER_ADMIN) return null;
  let status = dbUser.company?.status;
  if (status === undefined && dbUser.companyId) {
    const c = await prisma.company.findUnique({ where: { id: dbUser.companyId }, select: { status: true } });
    status = c?.status;
  }
  if (status === CompanyStatus.SUSPENDED || status === CompanyStatus.CANCELED) {
    return NextResponse.json(
      { error: 'Assinatura suspensa. Entre em contato com o suporte para reativar o acesso.', code: 'SUBSCRIPTION_BLOCKED' },
      { status: 403 }
    );
  }
  return null;
}

// Conjuntos de papéis. ADMIN = gestão; STAFF = operação (inclui recepção/atendimento).
export const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER];
export const STAFF_ROLES: UserRole[] = [...ADMIN_ROLES, UserRole.RECEPTION, UserRole.ATTENDANCE];

// Devolve 403 se o usuário não tem um dos papéis exigidos; caso contrário null.
export function requireRole(dbUser: { role: UserRole }, roles: UserRole[]) {
  return roles.includes(dbUser.role)
    ? null
    : NextResponse.json({ error: 'Sem permissão para esta ação' }, { status: 403 });
}

// Devolve 403 se o usuário não é SUPER_ADMIN (dono do SaaS); caso contrário null.
// Usado nas rotas /api/admin/* que cruzam o limite de empresa.
export function requireSuperAdmin(dbUser: { role: UserRole }) {
  return dbUser.role === UserRole.SUPER_ADMIN
    ? null
    : NextResponse.json({ error: 'Acesso restrito ao administrador do sistema' }, { status: 403 });
}
