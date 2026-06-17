import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  type: z.enum(['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'OVERDUE']).optional(),
  canceledReason: z.string().optional(),
});

async function update(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.followUpTask.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());
    const now = new Date();
    const task = await prisma.followUpTask.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.dueDate !== undefined && { dueDate: new Date(/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) ? `${d.dueDate}T12:00:00` : d.dueDate) }),
        ...(d.priority !== undefined && { priority: d.priority }),
        ...(d.type !== undefined && { type: d.type }),
        ...(d.status !== undefined && {
          status: d.status,
          completedAt: d.status === 'COMPLETED' ? now : existing.completedAt,
          canceledAt: d.status === 'CANCELED' ? now : existing.canceledAt,
          canceledReason: d.status === 'CANCELED' ? (d.canceledReason || null) : existing.canceledReason,
        }),
      },
    });
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export const PUT = update;
export const PATCH = update;

// DELETE /api/followup/tasks/[id] - soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.followUpTask.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });

    await prisma.followUpTask.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
