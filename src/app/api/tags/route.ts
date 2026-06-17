import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';

// Catálogo de tags da EMPRESA (escopado por companyId). Tags são do módulo de
// pacientes. Único por (companyId, name).

async function resolve() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };
  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };
  return { dbUser };
}

// GET /api/tags - lista as tags da empresa.
export async function GET() {
  try {
    const { dbUser, error } = await resolve();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'patients', 'view');
    if (denied) return denied;

    const tags = await prisma.tag.findMany({
      where: { companyId: dbUser!.companyId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(tags);
  } catch (err) {
    console.error('Erro ao listar tags:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome da tag é obrigatório'),
  color: z.string().optional(),
});

// POST /api/tags - cria uma tag na empresa.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolve();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'patients', 'edit');
    if (denied) return denied;

    const d = CreateSchema.parse(await request.json());
    try {
      const tag = await prisma.tag.create({
        data: { name: d.name.trim(), color: d.color || '#3B82F6', companyId: dbUser!.companyId },
      });
      return NextResponse.json(tag, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'Já existe uma tag com esse nome nesta clínica' }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar tag:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
