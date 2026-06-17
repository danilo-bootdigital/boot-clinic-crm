import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';

const Schema = z.object({
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']),
});

// PUT /api/users/[id] - altera o papel (RBAC) de um usuário da empresa.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    // Evita lockout: não permite alterar o próprio papel.
    if (params.id === dbUser!.id) {
      return NextResponse.json({ error: 'Você não pode alterar o seu próprio papel' }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const { role } = Schema.parse(await request.json());
    const user = await prisma.user.update({
      where: { id: params.id },
      data: { role: role as UserRole },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar usuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
