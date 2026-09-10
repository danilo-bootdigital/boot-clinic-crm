'use client';

import { Check, Repeat, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';
import { isTaskOpen, relativeDueLabel, taskStatusMeta } from '@/lib/followup/task-status';
import { categoryLabel } from '@/lib/followup/categories';
import { PRIORITY_LABELS } from '@/components/tasks/TaskForm';

export interface TaskListItemData {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  category?: string | null;
  dueDate: string;
  isRecurring?: boolean;
  createdById: string;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  patient?: { id: string; name: string } | null;
}

/** Card/linha de tarefa — mesma peça na lista de /tarefas e no widget do Dashboard. */
export function TaskListItem({
  task,
  currentUserId,
  isAdmin,
  onOpen,
  onComplete,
  onDelete,
}: {
  task: TaskListItemData;
  currentUserId: string;
  isAdmin: boolean;
  onOpen: (task: TaskListItemData) => void;
  onComplete: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const meta = taskStatusMeta(task as any);
  const open = isTaskOpen(task as any);
  const completed = task.status === 'COMPLETED';
  const canComplete = open && (isAdmin || task.assignedToId === currentUserId || task.createdById === currentUserId);
  const canDelete = !!onDelete && isAdmin;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <button
        type="button"
        aria-label={completed ? 'Tarefa concluída' : 'Concluir tarefa'}
        disabled={!canComplete}
        onClick={() => canComplete && onComplete(task.id)}
        className={cn(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors',
          completed ? 'border-success bg-success text-white' : 'border-input bg-background',
          canComplete && !completed && 'hover:border-success hover:bg-success/10',
          !canComplete && 'cursor-not-allowed opacity-50',
        )}
      >
        {completed && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>

      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-medium text-foreground', completed && 'text-muted-foreground line-through')}>
            {task.title}
          </span>
          <StatusBadge tone={meta.tone as any}>{meta.label}</StatusBadge>
          {task.isRecurring && <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-label="Recorrente" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[
            categoryLabel(task.category),
            task.assignedTo?.name ?? 'Sem responsável',
            open ? relativeDueLabel(task.dueDate) : `venceu em ${new Date(task.dueDate).toLocaleDateString('pt-BR')}`,
            PRIORITY_LABELS[task.priority],
            task.patient?.name,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {task.description && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{task.description}</p>}
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete!(task.id)}
          title="Excluir"
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default TaskListItem;
