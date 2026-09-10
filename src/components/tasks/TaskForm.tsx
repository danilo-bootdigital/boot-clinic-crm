'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';
import { TASK_CATEGORIES, TASK_CATEGORY_LABELS } from '@/lib/followup/categories';

export const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' };

export const RECURRENCE_OPTIONS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export const RECURRENCE_LABELS: Record<string, string> = { DAILY: 'Diariamente', WEEKLY: 'Semanalmente', MONTHLY: 'Mensalmente', YEARLY: 'Anualmente' };

export interface TaskFormValue {
  title: string;
  dueDate: string; // YYYY-MM-DD
  priority: (typeof PRIORITY_OPTIONS)[number];
  assignedToId: string;
  description: string;
  category: string; // '' | uma de TASK_CATEGORIES | valor livre ("Outro")
  patientId: string;
  isRecurring: boolean;
  recurrenceType: (typeof RECURRENCE_OPTIONS)[number];
  recurrenceEvery: number;
}

export function emptyTaskForm(defaultAssigneeId = ''): TaskFormValue {
  return {
    title: '',
    dueDate: new Date().toISOString().split('T')[0],
    priority: 'MEDIUM',
    assignedToId: defaultAssigneeId,
    description: '',
    category: '',
    patientId: '',
    isRecurring: false,
    recurrenceType: 'WEEKLY',
    recurrenceEvery: 1,
  };
}

interface Person {
  id: string;
  name: string;
}

/**
 * Formulário único de tarefa — usado na página /tarefas, no drawer de criação
 * rápida e no drawer de tarefas da conversa (mensageria). Um só componente
 * para não divergir campo a campo entre as três telas.
 *
 * Visão inicial: Título, Prazo, Responsável, Prioridade. "Mais opções" revela
 * Descrição, Categoria, Paciente e Recorrência — reduz fricção para o caso
 * comum (recepção cadastrando uma tarefa em segundos) sem esconder o resto.
 */
export function TaskForm({
  value,
  onChange,
  users,
  patients,
  defaultExpanded = false,
}: {
  value: TaskFormValue;
  onChange: (next: TaskFormValue) => void;
  users: Person[];
  patients?: Person[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const set = <K extends keyof TaskFormValue>(key: K, v: TaskFormValue[K]) => onChange({ ...value, [key]: v });
  const label = 'mb-1 block text-xs font-medium text-foreground';
  const customCategory = value.category !== '' && !(TASK_CATEGORIES as readonly string[]).includes(value.category);

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Título *</label>
        <Input className="w-full" value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Pausar campanha de Botox" required />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Prazo *</label>
          <Input type="date" className="w-full" value={value.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
        </div>
        <div>
          <label className={label}>Responsável *</label>
          <FilterSelect className="w-full" value={value.assignedToId} onChange={(e) => set('assignedToId', e.target.value)} required>
            <option value="">Selecione…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </FilterSelect>
        </div>
        <div>
          <label className={label}>Prioridade</label>
          <FilterSelect className="w-full" value={value.priority} onChange={(e) => set('priority', e.target.value as TaskFormValue['priority'])}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </FilterSelect>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Mais opções
      </button>

      {expanded && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
          <div>
            <label className={label}>Descrição</label>
            <Textarea className="w-full" rows={3} value={value.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Categoria</label>
              <FilterSelect
                className="w-full"
                value={customCategory ? 'OUTRO' : value.category}
                onChange={(e) => set('category', e.target.value === 'OUTRO' ? ' ' : e.target.value)}
              >
                <option value="">—</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{TASK_CATEGORY_LABELS[c]}</option>
                ))}
                <option value="OUTRO">{TASK_CATEGORY_LABELS.OUTRO}</option>
              </FilterSelect>
              {customCategory && (
                <Input
                  className="mt-2 w-full"
                  placeholder="Descreva a categoria"
                  value={value.category.trim()}
                  onChange={(e) => set('category', e.target.value)}
                  autoFocus
                />
              )}
            </div>
            {patients && (
              <div>
                <label className={label}>Paciente</label>
                <FilterSelect className="w-full" value={value.patientId} onChange={(e) => set('patientId', e.target.value)}>
                  <option value="">—</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </FilterSelect>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" checked={value.isRecurring} onChange={(e) => set('isRecurring', e.target.checked)} className="h-4 w-4 rounded border-input" />
              Tarefa recorrente
            </label>
            {value.isRecurring && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Frequência</label>
                  <FilterSelect className="w-full" value={value.recurrenceType} onChange={(e) => set('recurrenceType', e.target.value as TaskFormValue['recurrenceType'])}>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
                    ))}
                  </FilterSelect>
                </div>
                <div>
                  <label className={label}>A cada</label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    className="w-full"
                    value={value.recurrenceEvery}
                    onChange={(e) => set('recurrenceEvery', Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Ao concluir, a próxima ocorrência é criada automaticamente com o novo prazo.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskForm;
