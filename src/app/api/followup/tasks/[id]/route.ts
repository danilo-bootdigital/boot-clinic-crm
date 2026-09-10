import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient, ownsDeal, ownsAppointment, ownsUser } from '@/lib/api/ownership';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { canEditTask, canReassignTask, canCompleteTask, canCancelTask, canDeleteTask } from '@/lib/followup/access';
import { parseDueDate } from '@/lib/followup/dates';
import { nextOccurrenceDueDate } from '@/lib/followup/recurrence';

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.string().max(40).optional().nullable(),
  type: z.enum(['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'OVERDUE']).optional(),
  canceledReason: z.string().optional(),
  assignedToId: z.string().min(1).optional(),
  patientId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
});

async function update(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('followup');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.followUpTask.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });

    // Camada de posse sobre a permissão de módulo: quem não é gestão só mexe
    // nas tarefas que criou ou das quais é responsável.
    if (!canEditTask(dbUser!, existing)) {
      return NextResponse.json({ error: 'Sem permissão para editar esta tarefa' }, { status: 403 });
    }

    const d = UpdateSchema.parse(await request.json());

    if (d.assignedToId !== undefined && d.assignedToId !== existing.assignedToId) {
      if (!canReassignTask(dbUser!, existing)) {
        return NextResponse.json({ error: 'Sem permissão para reatribuir esta tarefa' }, { status: 403 });
      }
      if (!(await ownsUser(dbUser!.companyId, d.assignedToId))) {
        return NextResponse.json({ error: 'Responsável inválido' }, { status: 400 });
      }
    }
    if (d.patientId && d.patientId !== existing.patientId && !(await ownsPatient(dbUser!.companyId, d.patientId))) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }
    if (d.dealId && d.dealId !== existing.dealId && !(await ownsDeal(dbUser!.companyId, d.dealId))) {
      return NextResponse.json({ error: 'Oportunidade inválida' }, { status: 400 });
    }
    if (d.appointmentId && d.appointmentId !== existing.appointmentId && !(await ownsAppointment(dbUser!.companyId, d.appointmentId))) {
      return NextResponse.json({ error: 'Agendamento inválido' }, { status: 400 });
    }

    if (d.status !== undefined && d.status !== existing.status) {
      if (d.status === 'CANCELED' && !canCancelTask(dbUser!, existing)) {
        return NextResponse.json({ error: 'Cancelar tarefas é uma ação de gestão' }, { status: 403 });
      }
      if (d.status === 'COMPLETED' && !canCompleteTask(dbUser!, existing)) {
        return NextResponse.json({ error: 'Sem permissão para concluir esta tarefa' }, { status: 403 });
      }
    }

    const now = new Date();
    const willComplete = d.status === 'COMPLETED' && existing.status !== 'COMPLETED';

    const task = await prisma.followUpTask.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.dueDate !== undefined && { dueDate: parseDueDate(d.dueDate) }),
        ...(d.priority !== undefined && { priority: d.priority }),
        ...(d.category !== undefined && { category: (d.category || '').trim() || null }),
        ...(d.type !== undefined && { type: d.type }),
        ...(d.assignedToId !== undefined && { assignedToId: d.assignedToId }),
        ...(d.patientId !== undefined && { patientId: d.patientId || null }),
        ...(d.dealId !== undefined && { dealId: d.dealId || null }),
        ...(d.appointmentId !== undefined && { appointmentId: d.appointmentId || null }),
        ...(d.status !== undefined && {
          status: d.status,
          completedAt: d.status === 'COMPLETED' ? now : existing.completedAt,
          completedById: d.status === 'COMPLETED' ? dbUser!.id : existing.completedById,
          canceledAt: d.status === 'CANCELED' ? now : existing.canceledAt,
          canceledReason: d.status === 'CANCELED' ? (d.canceledReason || null) : existing.canceledReason,
        }),
      },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.FOLLOW_UP_TASK,
      entityId: task.id,
      oldValues: { status: existing.status, assignedToId: existing.assignedToId },
      newValues: { status: task.status, assignedToId: task.assignedToId },
      request,
    });

    // Recorrência sem cron: concluir uma tarefa recorrente gera a próxima
    // ocorrência já aqui — a data soma o intervalo à dueDate CONCLUÍDA (não à
    // data de hoje), então a série não deriva com atrasos acumulados. O
    // histórico da tarefa concluída não é tocado.
    let nextOccurrenceId: string | null = null;
    if (willComplete && existing.isRecurring && existing.recurrenceType) {
      const nextDue = nextOccurrenceDueDate(existing.dueDate, existing.recurrenceType as any, existing.recurrenceEvery || 1);
      const nextTask = await prisma.followUpTask.create({
        data: {
          title: existing.title,
          description: existing.description,
          dueDate: nextDue,
          status: 'PENDING',
          priority: existing.priority,
          category: existing.category,
          type: existing.type,
          assignedToId: existing.assignedToId,
          patientId: existing.patientId,
          dealId: existing.dealId,
          appointmentId: existing.appointmentId,
          conversationId: existing.conversationId,
          isRecurring: true,
          recurrenceType: existing.recurrenceType,
          recurrenceEvery: existing.recurrenceEvery,
          recurrenceParentId: existing.recurrenceParentId || existing.id,
          createdById: existing.createdById,
          companyId: existing.companyId,
        },
      });
      nextOccurrenceId = nextTask.id;
      await writeAudit({
        dbUser: dbUser!,
        action: ActionType.CREATE,
        entityType: EntityType.FOLLOW_UP_TASK,
        entityId: nextTask.id,
        newValues: { title: nextTask.title, dueDate: nextTask.dueDate, recurrenceParentId: nextTask.recurrenceParentId },
        request,
      });
    }

    return NextResponse.json({ ...task, nextOccurrenceId });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export const PUT = update;
export const PATCH = update;

// DELETE /api/followup/tasks/[id] - soft delete, reservado à gestão (evita
// exclusão acidental por quem só deveria poder concluir/cancelar).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('followup');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'followup', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.followUpTask.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });

    if (!canDeleteTask(dbUser!, existing)) {
      return NextResponse.json({ error: 'Excluir tarefas é uma ação de gestão' }, { status: 403 });
    }

    await prisma.followUpTask.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.ARCHIVE,
      entityType: EntityType.FOLLOW_UP_TASK,
      entityId: existing.id,
      oldValues: { title: existing.title },
      request,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir tarefa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
