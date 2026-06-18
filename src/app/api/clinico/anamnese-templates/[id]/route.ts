import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { CreateAnamnesisTemplateSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.anamnesisTemplate.findFirst({ where: { id, companyId, deletedAt: null } });
}

// GET - detalhe do modelo (com perguntas).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'view');
    if (error) return error;
    const tpl = await prisma.anamnesisTemplate.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!tpl) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
    return NextResponse.json(tpl);
  } catch (err) {
    console.error('Erro ao buscar modelo de anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - atualiza dados e substitui o conjunto de perguntas (se enviado).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

    const d = CreateAnamnesisTemplateSchema.partial().parse(await request.json());

    const tpl = await prisma.$transaction(async (tx) => {
      await tx.anamnesisTemplate.update({
        where: { id: params.id },
        data: {
          ...(d.name !== undefined && { name: d.name }),
          ...(d.specialty !== undefined && { specialty: d.specialty || null }),
          ...(d.description !== undefined && { description: d.description || null }),
          ...(d.isActive !== undefined && { isActive: d.isActive }),
        },
      });
      if (d.questions) {
        await tx.anamnesisQuestion.deleteMany({ where: { templateId: params.id } });
        if (d.questions.length) {
          await tx.anamnesisQuestion.createMany({
            data: d.questions.map((q, i) => ({
              templateId: params.id,
              companyId: dbUser!.companyId,
              label: q.label,
              type: q.type,
              options: q.options ?? undefined,
              required: q.required ?? false,
              order: q.order ?? i,
            })),
          });
        }
      }
      return tx.anamnesisTemplate.findUnique({
        where: { id: params.id },
        include: { questions: { orderBy: { order: 'asc' } } },
      });
    });

    return NextResponse.json(tpl);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar modelo de anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE - soft delete.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('anamnese', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

    await prisma.anamnesisTemplate.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir modelo de anamnese:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
