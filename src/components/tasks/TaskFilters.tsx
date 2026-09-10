'use client';

import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';

export type TaskFilterKey = 'all' | 'mine' | 'today' | 'week' | 'overdue' | 'completed';

const FILTERS: { key: TaskFilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'mine', label: 'Minhas tarefas' },
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: 'Esta semana' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'completed', label: 'Concluídas' },
];

export function TaskFilters({
  filter,
  onFilterChange,
  counts,
  search,
  onSearchChange,
  showMineFilter = true,
}: {
  filter: TaskFilterKey;
  onFilterChange: (f: TaskFilterKey) => void;
  counts?: Partial<Record<TaskFilterKey, number>>;
  search: string;
  onSearchChange: (s: string) => void;
  showMineFilter?: boolean;
}) {
  const chips = FILTERS.filter((f) => showMineFilter || f.key !== 'mine');

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={onSearchChange} placeholder="Buscar tarefas por título, descrição ou paciente…" />
      <div className="flex flex-wrap gap-2">
        {chips.map(({ key, label }) => {
          const active = filter === key;
          const count = counts?.[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? key === 'overdue'
                    ? 'border-destructive bg-destructive text-white'
                    : 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-muted',
              )}
            >
              {label}
              {typeof count === 'number' && <span className="ml-1 opacity-80">({count})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TaskFilters;
