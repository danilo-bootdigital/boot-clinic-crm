import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/api/audit';

// POST /api/admin/companies/[id]/users/[uid]/reset-password — SUPORTE SaaS.
// O SUPER_ADMIN redefine a senha de um usuário de QUALQUER clínica (escopado à
// clínica [id]). Define senha provisória via service role; senha nunca é logada.
const Schema = z.object({ password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres').max(72) });

export async function POST(request: NextRequest, { params }: { params: { id: string; uid: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    // Alvo precisa pertencer à clínica informada (escopo explícito por [id]).
    const target = await prisma.user.findFirst({
      where: { id: params.uid, companyId: params.id, deletedAt: null },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado nesta clínica' }, { status: 404 });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: 'Redefinição indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' }, { status: 503 });
    }

    const { password } = Schema.parse(await request.json());
    const { error: authErr } = await admin.auth.admin.updateUserById(params.uid, { password });
    if (authErr) {
      console.error('admin reset-password auth error:', authErr);
      return NextResponse.json({ error: 'Falha ao redefinir a senha' }, { status: 400 });
    }

    // Auditoria escopada à clínica AFETADA (não à do super-admin) — corrige a R2.
    await writeAudit({
      dbUser: { id: dbUser!.id, name: dbUser!.name, companyId: params.id },
      action: 'UPDATE', entityType: 'USER', entityId: params.uid,
      newValues: { passwordReset: true, by: 'SUPER_ADMIN' }, request,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao redefinir senha (admin):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
