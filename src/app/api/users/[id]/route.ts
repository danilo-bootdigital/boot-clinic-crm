import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';
import { requirePermission, sanitizePermissions } from '@/lib/api/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

const Schema = z.object({
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']).optional(),
  permissions: z.any().optional(),
});

// PUT /api/users/[id] - altera o papel (RBAC) de um usuário da empresa.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit') || requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    // Evita lockout: não permite alterar o próprio papel.
    if (params.id === dbUser!.id) {
      return NextResponse.json({ error: 'Você não pode alterar o seu próprio papel/permissões' }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const d = Schema.parse(await request.json());
    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        ...(d.role !== undefined && { role: d.role as UserRole }),
        ...(d.permissions !== undefined && { permissions: sanitizePermissions(d.permissions) }),
      },
      select: { id: true, name: true, email: true, role: true, permissions: true },
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar usuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/users/[id] - remove o usuário (conta no Auth + soft-delete no banco).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit') || requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    if (params.id === dbUser!.id) {
      return NextResponse.json({ error: 'Você não pode remover a si mesmo' }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // Remove a conta de acesso no Supabase Auth (se a service key estiver configurada).
    const admin = createAdminClient();
    if (admin) await admin.auth.admin.deleteUser(params.id).catch(() => {});

    await prisma.user.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover usuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
