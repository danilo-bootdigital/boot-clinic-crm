import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
});

// PUT /api/mensageria/tags/[id] — renomeia/recolore. Afeta TODOS os contatos
// e pacientes que já usam esta etiqueta (catálogo compartilhado).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const existing = await prisma.tag.findFirst({ where: { id: params.id, companyId: dbUser!.companyId } });
    if (!existing) return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());
    try {
      const tag = await prisma.tag.update({
        where: { id: params.id },
        data: {
          ...(d.name !== undefined && { name: d.name.trim() }),
          ...(d.color !== undefined && { color: d.color }),
        },
      });
      return NextResponse.json(tag);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json({ error: 'Já existe uma etiqueta com esse nome nesta clínica' }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar etiqueta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/mensageria/tags/[id] — remove a etiqueta do catálogo (cascade
// tira ela de todo mundo que a usava — o front avisa antes de chamar isto).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const existing = await prisma.tag.findFirst({ where: { id: params.id, companyId: dbUser!.companyId } });
    if (!existing) return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 });

    await prisma.tag.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir etiqueta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
