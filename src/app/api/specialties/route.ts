import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';

const DEFAULTS = ['Clínica Geral', 'Cardiologia', 'Dermatologia', 'Pediatria', 'Ortopedia'];
const Schema = z.object({ name: z.string().min(1), description: z.string().optional() });

// GET /api/specialties - lista (cria padrões na 1ª vez)
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const count = await prisma.specialty.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.specialty.createMany({ data: DEFAULTS.map((name) => ({ name, companyId: dbUser!.companyId })) });
    }

    const items = await prisma.specialty.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(items);
  } catch (err) {
    console.error('Erro ao listar especialidades:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/specialties
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;
    const data = Schema.parse(await request.json());

    const exists = await prisma.specialty.findFirst({
      where: { name: data.name, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (exists) return NextResponse.json({ error: 'Especialidade já existe' }, { status: 400 });

    const item = await prisma.specialty.create({
      data: { name: data.name, description: data.description || null, companyId: dbUser!.companyId },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Especialidade já existe' }, { status: 400 });
    }
    console.error('Erro ao criar especialidade:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
