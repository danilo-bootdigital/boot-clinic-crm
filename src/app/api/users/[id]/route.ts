import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma, UserRole } from '@prisma/client';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';
import { requirePermission, sanitizePermissions } from '@/lib/api/permissions';
import { canManageTarget, canAssignRole } from '@/lib/api/role-hierarchy';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/api/audit';

const Schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(160).optional(),
  email: z.string().email('E-mail inválido').optional(),
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']).optional(),
  permissions: z.any().optional(),
});

// PUT /api/users/[id] - edita dados do usuário da empresa (nome, e-mail, papel,
// permissões). O e-mail é o LOGIN: ao alterá-lo, sincroniza no Supabase Auth
// (obrigatório — não dessincroniza a tabela local do Auth). Alterações são auditadas.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit') || requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    const target = await prisma.user.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true, name: true, email: true, role: true, permissions: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    const d = Schema.parse(await request.json());

    const isSelf = params.id === dbUser!.id;

    // Evita lockout: não permite alterar o PRÓPRIO papel/permissões (nome/e-mail são liberados).
    if (isSelf && (d.role !== undefined || d.permissions !== undefined)) {
      return NextResponse.json({ error: 'Você não pode alterar o seu próprio papel/permissões' }, { status: 400 });
    }

    // SEC1 — hierarquia: só gerencia alvo de nível ESTRITAMENTE inferior (self é
    // exceção, pois pode editar o próprio nome/e-mail). MANAGER não edita OWNER, etc.
    if (!isSelf && !canManageTarget(dbUser!.role, target.role)) {
      return NextResponse.json({ error: 'Você não pode gerenciar um usuário de nível igual ou superior ao seu' }, { status: 403 });
    }
    // E não pode promover para um papel igual/superior ao seu (só SUPER_ADMIN cria SUPER_ADMIN).
    if (d.role !== undefined && !canAssignRole(dbUser!.role, d.role)) {
      return NextResponse.json({ error: 'Você não pode atribuir um papel igual ou superior ao seu' }, { status: 403 });
    }

    const emailChanged = d.email !== undefined && d.email !== target.email;

    // E-mail é o login (Supabase Auth). Sincronizar é obrigatório: sem o admin
    // client a alteração desincronizaria o login — então recusamos a mudança.
    if (emailChanged) {
      const admin = createAdminClient();
      if (!admin) {
        return NextResponse.json(
          { error: 'Alteração de e-mail indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' },
          { status: 503 }
        );
      }
      // Conflito local de e-mail (unique) — checa antes de tocar no Auth.
      const dup = await prisma.user.findFirst({ where: { email: d.email!, NOT: { id: params.id } }, select: { id: true } });
      if (dup) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });

      const { error: authErr } = await admin.auth.admin.updateUserById(params.id, { email: d.email!, email_confirm: true });
      if (authErr) {
        console.error('updateUserById auth error:', authErr);
        const msg = /already|registered|exists/i.test(authErr.message || '') ? 'E-mail já cadastrado' : 'Falha ao sincronizar o e-mail no login';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    let user;
    try {
      user = await prisma.user.update({
        where: { id: params.id },
        data: {
          ...(d.name !== undefined && { name: d.name }),
          ...(d.email !== undefined && { email: d.email }),
          ...(d.role !== undefined && { role: d.role as UserRole }),
          ...(d.permissions !== undefined && { permissions: sanitizePermissions(d.permissions) }),
        },
        select: { id: true, name: true, email: true, role: true, permissions: true },
      });
    } catch (dbErr) {
      // Banco falhou DEPOIS de já ter trocado o e-mail no Auth → reverte o Auth p/ não dessincronizar.
      if (emailChanged) {
        const admin = createAdminClient();
        if (admin) await admin.auth.admin.updateUserById(params.id, { email: target.email, email_confirm: true }).catch(() => {});
      }
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
      }
      throw dbErr;
    }

    // Auditoria: registra apenas os campos efetivamente enviados (antes → depois).
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const k of ['name', 'email', 'role', 'permissions'] as const) {
      if (d[k] !== undefined) { oldValues[k] = (target as any)[k]; newValues[k] = (user as any)[k]; }
    }
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'USER', entityId: params.id, oldValues, newValues, request });

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

    // SEC1 — hierarquia: só exclui alvo de nível ESTRITAMENTE inferior (auto-exclusão
    // já bloqueada acima). MANAGER não exclui OWNER/SUPER_ADMIN; OWNER não exclui OWNER.
    if (!canManageTarget(dbUser!.role, target.role)) {
      return NextResponse.json({ error: 'Você não pode excluir um usuário de nível igual ou superior ao seu' }, { status: 403 });
    }

    // Remove a conta de acesso no Supabase Auth (se a service key estiver configurada).
    const admin = createAdminClient();
    if (admin) await admin.auth.admin.deleteUser(params.id).catch(() => {});

    // Soft-delete liberando o e-mail (unique) para permitir recadastro futuro.
    await prisma.user.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), email: `removido_${params.id}@deleted.local` },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover usuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
