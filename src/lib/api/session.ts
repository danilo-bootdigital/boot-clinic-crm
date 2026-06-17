import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';

// Resolve o usuário do banco a partir da sessão Supabase, devolvendo o escopo
// de empresa. Retorna { error } pronto para responder quando não autenticado.
export async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };
  return { dbUser };
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
