import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { UserRole, Prisma } from '@prisma/client';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';
import { requirePermission, sanitizePermissions } from '@/lib/api/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']),
  permissions: z.any().optional(),
});

// GET /api/users - lista usuários da empresa (id, nome, e-mail, papel, permissões).
// Mantido acessível a qualquer autenticado (alimenta selects de "responsável").
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const users = await prisma.user.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true, name: true, email: true, role: true, permissions: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/users - cria um usuário (Supabase Auth + linha no banco) com permissões.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    // Gestão de usuários exige acesso de edição em Configurações (ou ser admin).
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit') || requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Criação de usuários indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.' },
        { status: 503 }
      );
    }

    const d = CreateSchema.parse(await request.json());

    // Cria a conta no Supabase Auth (e-mail confirmado).
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
    });
    if (authErr || !created?.user) {
      console.error('createUser auth error:', authErr);
      const msg = /already|registered|exists/i.test(authErr?.message || '') ? 'E-mail já cadastrado' : 'Falha ao criar conta de acesso';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Cria a linha no banco com id = UID do Auth, papel e permissões.
    // Se a inserção no banco falhar, desfaz a conta no Auth (evita órfão).
    try {
      const user = await prisma.user.create({
        data: {
          id: created.user.id,
          email: d.email,
          name: d.name,
          role: d.role as UserRole,
          companyId: dbUser!.companyId,
          permissions: sanitizePermissions(d.permissions),
        },
        select: { id: true, name: true, email: true, role: true, permissions: true },
      });
      return NextResponse.json(user, { status: 201 });
    } catch (dbErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
      }
      throw dbErr;
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
    }
    console.error('Erro ao criar usuário:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
