'use client';

import { Drawer } from '@/components/ui/drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { isTaskOpen, relativeDueLabel, taskStatusMeta } from '@/lib/followup/task-status';
import { TaskForm, type TaskFormValue } from '@/components/tasks/TaskForm';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export interface EditingTask {
  id: string;
  status: string;
  dueDate: string;
  createdAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  canceledReason?: string | null;
  createdById: string;
  assignedToId?: string | null;
  createdBy?: { name: string } | null;
  completedBy?: { name: string } | null;
}

/**
 * Drawer de criação/edição de tarefa — mesma peça na página /tarefas e no
 * botão "+ Nova tarefa" do widget do Dashboard. O drawer de tarefas da
 * conversa (mensageria) tem navegação própria (lista ⇄ formulário) e usa só
 * o <TaskForm/> por dentro, não este wrapper.
 */
export function TaskDrawer({
  open,
  onClose,
  editingTask,
  form,
  setForm,
  users,
  patients,
  onSubmit,
  busy,
  error,
  canComplete,
  canCancel,
  canDelete,
  onComplete,
  onCancel,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  editingTask: EditingTask | null;
  form: TaskFormValue;
  setForm: (v: TaskFormValue) => void;
  users: { id: string; name: string }[];
  patients: { id: string; name: string }[];
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error: string | null;
  canComplete: boolean;
  canCancel: boolean;
  canDelete: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const open_ = editingTask ? isTaskOpen(editingTask as any) : false;
  const meta = editingTask ? taskStatusMeta(editingTask as any) : null;

  return (
    <Drawer open={open} onClose={onClose} title={editingTask ? 'Tarefa' : 'Nova tarefa'} width="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        {editingTask && meta && (
          <div className="flex items-center gap-2">
            <StatusBadge tone={meta.tone as any}>{meta.label}</StatusBadge>
            {open_ && <span className="text-xs text-muted-foreground">{relativeDueLabel(editingTask.dueDate)}</span>}
          </div>
        )}

        <TaskForm value={form} onChange={setForm} users={users} patients={patients} defaultExpanded={!!(form.description || form.category || form.patientId || form.isRecurring)} />

        {editingTask && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Histórico</p>
            <p>Criada em {formatDateTime(editingTask.createdAt)}{editingTask.createdBy ? ` por ${editingTask.createdBy.name}` : ''}</p>
            {editingTask.completedAt && (
              <p className="text-success">
                Concluída em {formatDateTime(editingTask.completedAt)}{editingTask.completedBy ? ` por ${editingTask.completedBy.name}` : ''}
              </p>
            )}
            {editingTask.canceledAt && (
              <p>Cancelada em {formatDateTime(editingTask.canceledAt)}{editingTask.canceledReason ? `: "${editingTask.canceledReason}"` : ''}</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
          <div className="flex gap-2">
            {editingTask && open_ && canComplete && (
              <button type="button" onClick={onComplete} className="rounded-lg border border-success/30 px-3 py-2 text-sm font-medium text-success hover:bg-success/10">
                Concluir tarefa
              </button>
            )}
            {editingTask && open_ && canCancel && (
              <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                Cancelar tarefa
              </button>
            )}
            {editingTask && canDelete && (
              <button type="button" onClick={onDelete} className="rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
              Voltar
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Drawer>
  );
}

export default TaskDrawer;
