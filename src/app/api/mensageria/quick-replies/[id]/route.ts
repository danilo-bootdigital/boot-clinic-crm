import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// PUT /api/mensageria/quick-replies/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.quickReply.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());
    const item = await prisma.quickReply.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.content !== undefined && { content: d.content }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
      },
    });
    return NextResponse.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/mensageria/quick-replies/[id] — soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.quickReply.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    await prisma.quickReply.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
