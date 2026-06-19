import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';

// GET /api/admin/companies/[id]/users — lista usuários de UMA clínica (SUPER_ADMIN).
// Suporte cross-clínica: o dono do SaaS gerencia usuários de qualquer clínica.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const users = await prisma.user.findMany({
      where: { companyId: params.id, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários da clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
