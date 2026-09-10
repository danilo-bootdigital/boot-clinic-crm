import { addDays, addWeeks, addMonths, addYears } from 'date-fns';

// Recorrência simples (sem cron/job de fundo): ao concluir uma tarefa
// recorrente, a API soma o intervalo à dueDate CONCLUÍDA (não à data atual) e
// cria a próxima ocorrência como uma tarefa nova — o histórico da ocorrência
// concluída nunca é alterado retroativamente.
export type RecurrenceTypeValue = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export function nextOccurrenceDueDate(current: Date, type: RecurrenceTypeValue, every: number): Date {
  const n = Number.isFinite(every) && every > 0 ? every : 1;
  switch (type) {
    case 'DAILY':
      return addDays(current, n);
    case 'WEEKLY':
      return addWeeks(current, n);
    case 'MONTHLY':
      return addMonths(current, n);
    case 'YEARLY':
      return addYears(current, n);
    default:
      return addDays(current, n);
  }
}
