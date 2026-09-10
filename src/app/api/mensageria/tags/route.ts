import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// Catálogo de etiquetas da EMPRESA — MESMO model `Tag` usado pelos pacientes
// (src/app/api/tags/route.ts), só gateado pelo módulo 'whatsapp' em vez de
// 'patients': uma etiqueta criada aqui aparece pra pacientes também (e
// vice-versa) — é o mesmo catálogo único por (companyId, name).

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  color: z.string().optional(),
});

// GET /api/mensageria/tags — lista as etiquetas da empresa.
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const tags = await prisma.tag.findMany({
      where: { companyId: dbUser!.companyId },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(tags);
  } catch (err) {
    console.error('Erro ao listar etiquetas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/mensageria/tags — cria uma etiqueta na empresa (sem atribuir a ninguém ainda).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const d = CreateSchema.parse(await request.json());
    try {
      const tag = await prisma.tag.create({
        data: { name: d.name.trim(), color: d.color || '#3B82F6', companyId: dbUser!.companyId },
      });
      return NextResponse.json(tag, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'Já existe uma etiqueta com esse nome nesta clínica' }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar etiqueta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
