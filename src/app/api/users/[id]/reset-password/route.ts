import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { canManageTarget } from '@/lib/api/role-hierarchy';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/api/audit';

// AÇÃO ADMINISTRATIVA SEPARADA — não é edição comum do cadastro.
// Define uma nova senha provisória no Supabase Auth (mesmo mecanismo seguro da
// criação de usuário). A senha NUNCA é gravada/auditada em texto — só o evento.
// (Fluxo de "link por e-mail" depende de e-mail transacional ainda não configurado.)
const Schema = z.object({ password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres').max(72) });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit') || requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    const target = await prisma.user.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true, name: true, role: true },
    });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // SEC1 — hierarquia: só redefine senha de alvo ESTRITAMENTE inferior. Redefinir
    // a própria senha é permitido (não é escalonamento). MANAGER não reseta OWNER, etc.
    const isSelf = params.id === dbUser!.id;
    if (!isSelf && !canManageTarget(dbUser!.role, target.role)) {
      return NextResponse.json({ error: 'Você não pode redefinir a senha de um usuário de nível igual ou superior ao seu' }, { status: 403 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Redefinição indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' },
        { status: 503 }
      );
    }

    const { password } = Schema.parse(await request.json());
    const { error: authErr } = await admin.auth.admin.updateUserById(params.id, { password });
    if (authErr) {
      console.error('reset-password auth error:', authErr);
      return NextResponse.json({ error: 'Falha ao redefinir a senha' }, { status: 400 });
    }

    await writeAudit({
      dbUser: dbUser!,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: params.id,
      newValues: { passwordReset: true },
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao redefinir senha:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
