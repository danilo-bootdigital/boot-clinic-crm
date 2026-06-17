import { NextResponse } from 'next/server';
import { resolveDbUser } from '@/lib/api/session';
import { effectivePermissions } from '@/lib/api/permissions';

// GET /api/me - usuário atual + permissões efetivas por módulo (para o frontend gatear menu/botões).
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    return NextResponse.json({
      id: dbUser!.id,
      name: dbUser!.name,
      email: dbUser!.email,
      role: dbUser!.role,
      permissions: effectivePermissions(dbUser!),
    });
  } catch (err) {
    console.error('Erro ao buscar usuário atual:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
