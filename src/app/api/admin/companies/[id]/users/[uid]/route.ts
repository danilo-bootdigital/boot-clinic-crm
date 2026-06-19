import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma, UserRole } from '@prisma/client';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/api/audit';

// PATCH /api/admin/companies/[id]/users/[uid] — SUPORTE SaaS: o SUPER_ADMIN edita
// nome/e-mail/papel de um usuário de QUALQUER clínica (escopado à clínica [id]).
// NÃO permite atribuir SUPER_ADMIN (papel de nível SaaS, não de clínica) nem
// alterar o papel de um SUPER_ADMIN por aqui (gestão de super-admin é deliberada).
const Schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(160).optional(),
  email: z.string().email('E-mail inválido').optional(),
  role: z.enum(['OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string; uid: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const target = await prisma.user.findFirst({
      where: { id: params.uid, companyId: params.id, deletedAt: null },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado nesta clínica' }, { status: 404 });

    const d = Schema.parse(await request.json());

    // Não alterar o papel de um SUPER_ADMIN por este fluxo de clínica.
    if (d.role !== undefined && target.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Não é possível alterar o papel de um SUPER_ADMIN por aqui' }, { status: 400 });
    }

    const emailChanged = d.email !== undefined && d.email !== target.email;
    if (emailChanged) {
      const admin = createAdminClient();
      if (!admin) {
        return NextResponse.json({ error: 'Alteração de e-mail indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' }, { status: 503 });
      }
      const dup = await prisma.user.findFirst({ where: { email: d.email!, NOT: { id: params.uid } }, select: { id: true } });
      if (dup) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
      const { error: authErr } = await admin.auth.admin.updateUserById(params.uid, { email: d.email!, email_confirm: true });
      if (authErr) {
        console.error('admin updateUserById email error:', authErr);
        const msg = /already|registered|exists/i.test(authErr.message || '') ? 'E-mail já cadastrado' : 'Falha ao sincronizar o e-mail no login';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    let user;
    try {
      user = await prisma.user.update({
        where: { id: params.uid },
        data: {
          ...(d.name !== undefined && { name: d.name }),
          ...(d.email !== undefined && { email: d.email }),
          ...(d.role !== undefined && { role: d.role as UserRole }),
        },
        select: { id: true, name: true, email: true, role: true },
      });
    } catch (dbErr) {
      if (emailChanged) {
        const admin = createAdminClient();
        if (admin) await admin.auth.admin.updateUserById(params.uid, { email: target.email, email_confirm: true }).catch(() => {});
      }
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
      }
      throw dbErr;
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    for (const k of ['name', 'email', 'role'] as const) {
      if (d[k] !== undefined) { oldValues[k] = (target as any)[k]; newValues[k] = (user as any)[k]; }
    }
    // Auditoria escopada à clínica AFETADA (params.id), não à do super-admin.
    await writeAudit({
      dbUser: { id: dbUser!.id, name: dbUser!.name, companyId: params.id },
      action: 'UPDATE', entityType: 'USER', entityId: params.uid, oldValues, newValues, request,
    });

    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao editar usuário (admin):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
