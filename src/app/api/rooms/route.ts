import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';

const DEFAULTS = ['Sala 1', 'Sala 2'];
const Schema = z.object({ name: z.string().min(1), description: z.string().optional() });

// GET /api/rooms - lista (cria padrões na 1ª vez)
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const count = await prisma.room.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.room.createMany({ data: DEFAULTS.map((name) => ({ name, companyId: dbUser!.companyId })) });
    }

    const items = await prisma.room.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(items);
  } catch (err) {
    console.error('Erro ao listar salas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/rooms
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const data = Schema.parse(await request.json());

    const exists = await prisma.room.findFirst({
      where: { name: data.name, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (exists) return NextResponse.json({ error: 'Sala já existe' }, { status: 400 });

    const item = await prisma.room.create({
      data: { name: data.name, description: data.description || null, companyId: dbUser!.companyId },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar sala:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
