// Cálculo de status "de exibição" das tarefas de follow-up — compartilhado
// entre a página central (/followup) e o drawer de tarefas da mensageria
// (components/mensageria/ConversationTasks) para as duas concordarem no que
// é "atrasada" e há quanto tempo falta/passou do vencimento.
//
// O model guarda `status` (PENDING/IN_PROGRESS/COMPLETED/CANCELED/OVERDUE),
// mas nada transita automaticamente para OVERDUE quando o prazo passa — teria
// que rodar em algum cron. Em vez disso, a UI computa "atrasada" na hora
// (PENDING/IN_PROGRESS com dueDate no passado), sem depender de um job.

export type TaskStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'OVERDUE';

export interface TaskLike {
  status: TaskStatusValue | string;
  dueDate: string | Date;
}

export function isTaskOverdue(task: TaskLike, now: Date = new Date()): boolean {
  return (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && new Date(task.dueDate).getTime() < now.getTime();
}

export function isTaskOpen(task: TaskLike): boolean {
  return task.status === 'PENDING' || task.status === 'IN_PROGRESS';
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELED: 'Cancelada', OVERDUE: 'Atrasada',
};
const STATUS_TONES: Record<string, string> = {
  PENDING: 'warning', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELED: 'neutral', OVERDUE: 'destructive',
};

/** Label/tom já considerando o vencimento — "Pendente" vira "Atrasada" sem exigir job de fundo. */
export function taskStatusMeta(task: TaskLike, now: Date = new Date()): { label: string; tone: string } {
  if (isTaskOverdue(task, now)) return { label: STATUS_LABELS.OVERDUE, tone: STATUS_TONES.OVERDUE };
  return { label: STATUS_LABELS[task.status] || task.status, tone: STATUS_TONES[task.status] || 'neutral' };
}

/** "vence em 3 dias" / "atrasada há 2 horas" / "vence em instantes". Só para tarefa aberta. */
export function relativeDueLabel(dueDate: string | Date, now: Date = new Date()): string {
  const diffMs = new Date(dueDate).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  let value: number;
  let unit: string;
  if (abs < MIN) {
    return diffMs < 0 ? 'venceu agora' : 'vence em instantes';
  } else if (abs < HOUR) {
    value = Math.round(abs / MIN); unit = value === 1 ? 'minuto' : 'minutos';
  } else if (abs < DAY) {
    value = Math.round(abs / HOUR); unit = value === 1 ? 'hora' : 'horas';
  } else {
    value = Math.round(abs / DAY); unit = value === 1 ? 'dia' : 'dias';
  }
  return diffMs < 0 ? `atrasada há ${value} ${unit}` : `vence em ${value} ${unit}`;
}
