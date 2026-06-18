import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { CreateAnamnesisTemplateSchema } from '@/lib/validations/clinical';

// GET /api/clinico/anamnese-templates - modelos de anamnese da clínica.
export async function GET() {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'view');
    if (error) return error;

    const templates = await prisma.anamnesisTemplate.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (err) {
    console.error('Erro ao listar modelos de anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/clinico/anamnese-templates - cria modelo (com perguntas).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'edit');
    if (error) return error;

    const d = CreateAnamnesisTemplateSchema.parse(await request.json());

    const template = await prisma.anamnesisTemplate.create({
      data: {
        name: d.name,
        specialty: d.specialty || null,
        description: d.description || null,
        isActive: d.isActive ?? true,
        companyId: dbUser!.companyId,
        createdById: dbUser!.id,
        questions: d.questions?.length
          ? {
              create: d.questions.map((q, i) => ({
                companyId: dbUser!.companyId,
                label: q.label,
                type: q.type,
                options: q.options ?? undefined,
                required: q.required ?? false,
                order: q.order ?? i,
              })),
            }
          : undefined,
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      return NextResponse.json({ error: 'Já existe um modelo com este nome' }, { status: 400 });
    console.error('Erro ao criar modelo de anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
