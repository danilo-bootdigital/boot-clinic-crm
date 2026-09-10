'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, ListChecks } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { isTaskOpen, relativeDueLabel, taskStatusMeta } from '@/lib/followup/task-status';
import { TaskForm, emptyTaskForm, type TaskFormValue } from '@/components/tasks/TaskForm';
import { TaskListItem } from '@/components/tasks/TaskListItem';

/** ISO completo -> "YYYY-MM-DD" para preencher o <input type=date> na edição. */
function toDateInput(iso: string) {
  return String(iso).slice(0, 10);
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];

/**
 * Tarefas da conversa: dois botões irmãos que falam com o MESMO módulo de
 * Tarefas (mesma API, mesmo model, mesmo <TaskForm/> da página `/tarefas` —
 * um só formulário para a mesma entidade, como manda a regra de não duplicar
 * componentes).
 *
 * - "Nova tarefa": abre o drawer já no formulário de criação.
 * - Sino: carrega a lista assim que a conversa é selecionada — é a
 *   "notificação ao acessar a conversa" pedida. Fica vermelho com tarefa
 *   atrasada, amarelo com pendente no prazo, neutro sem nada — sem precisar
 *   clicar para saber. Clicar numa tarefa da lista abre ela por inteiro
 *   (descrição completa, histórico de conclusão/cancelamento) e permite editar.
 */
export function ConversationTasks({
  conversationId,
  patientId,
}: {
  conversationId: string;
  patientId?: string | null;
}) {
  const [me, setMe] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [permError, setPermError] = useState(false);
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null); // null = criando nova
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe);
    fetch('/api/users').then((r) => (r.ok ? r.json() : [])).then(setUsers);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/followup/tasks?conversationId=${conversationId}`, { cache: 'no-store' });
    if (res.status === 403) { setPermError(true); setTasks([]); return; }
    setPermError(false);
    setTasks(res.ok ? (await res.json()).tasks ?? [] : []);
  }, [conversationId]);

  // Carrega ao trocar de conversa — o sino já nasce no estado certo assim que
  // o atendente abre o chat, antes de qualquer clique.
  useEffect(() => { load(); }, [load]);

  const isAdmin = me ? ADMIN_ROLES.includes(me.role) : false;
  const abertas = (tasks ?? []).filter(isTaskOpen);
  // Reavalia "vencida" pelo relógio, não pelo campo `status` salvo — nada
  // transita pra OVERDUE sozinho no banco (exigiria um job de fundo).
  const vencidas = abertas.filter((t) => taskStatusMeta(t).label === 'Atrasada');

  function abrirCriar() {
    setForm(emptyTaskForm(me?.id ?? ''));
    setEditingTask(null);
    setError(null);
    setFormOpen(true);
    setOpen(true);
  }
  function abrirVer(t: any) {
    setForm({
      title: t.title,
      dueDate: toDateInput(t.dueDate),
      priority: t.priority,
      assignedToId: t.assignedToId || '',
      description: t.description || '',
      category: t.category || '',
      patientId: t.patientId || '',
      status: t.status,
      isRecurring: !!t.isRecurring,
      recurrenceType: t.recurrenceType || 'WEEKLY',
      recurrenceEvery: t.recurrenceEvery || 1,
    });
    setEditingTask(t);
    setError(null);
    setFormOpen(true);
  }
  function abrirLista() {
    setFormOpen(false);
    setEditingTask(null);
    setOpen(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload = { ...form, category: form.category.trim() };
    const res = editingTask
      ? await fetch(`/api/followup/tasks/${editingTask.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      : await fetch('/api/followup/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, conversationId, patientId: patientId || payload.patientId || undefined }),
        });
    setBusy(false);
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      setError(res.status === 403 ? 'Sem permissão no módulo Tarefas — peça para habilitar em Configurações.' : (er.error || 'Falha ao salvar tarefa'));
      return;
    }
    setFormOpen(false);
    setEditingTask(null);
    load();
  }

  async function setStatus(id: string, status: string, canceledReason?: string) {
    await fetch(`/api/followup/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(canceledReason !== undefined && { canceledReason }) }),
    });
    setFormOpen(false);
    setEditingTask(null);
    load();
  }

  function cancelarComMotivo(id: string) {
    const motivo = window.prompt('Motivo do cancelamento (opcional):');
    if (motivo === null) return; // usuário cancelou o próprio prompt
    setStatus(id, 'CANCELED', motivo);
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta tarefa?')) return;
    await fetch(`/api/followup/tasks/${id}`, { method: 'DELETE' });
    setFormOpen(false);
    setEditingTask(null);
    load();
  }

  const canCompleteEditing = !!editingTask && (isAdmin || editingTask.assignedToId === me?.id || editingTask.createdById === me?.id);

  return (
    <>
      <button
        type="button"
        onClick={abrirCriar}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <ListChecks className="h-3.5 w-3.5" />
        Nova tarefa
      </button>

      <button
        type="button"
        onClick={abrirLista}
        title={
          vencidas.length ? `${vencidas.length} tarefa(s) atrasada(s) nesta conversa`
            : abertas.length ? `${abertas.length} tarefa(s) pendente(s) nesta conversa`
            : 'Sem tarefas pendentes nesta conversa'
        }
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
          vencidas.length
            ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
            : abertas.length
            ? 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15'
            : 'border-border text-foreground hover:bg-muted'
        )}
      >
        <Bell className="h-3.5 w-3.5" />
        {abertas.length > 0 && (
          <span className={cn(
            'grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white',
            vencidas.length ? 'bg-destructive' : 'bg-warning'
          )}>
            {abertas.length}
          </span>
        )}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={formOpen ? (editingTask ? 'Tarefa' : 'Nova tarefa') : 'Tarefas'}
        description={formOpen ? undefined : 'Tarefas desta conversa'}
        width="max-w-lg"
      >
        {permError && (
          <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            Sem permissão no módulo Tarefas. Peça para habilitar em Configurações › Usuários.
          </p>
        )}

        {formOpen ? (
          <form onSubmit={salvar} className="space-y-4">
            {editingTask && (
              <div className="flex items-center gap-2">
                <StatusBadge tone={taskStatusMeta(editingTask).tone as any}>{taskStatusMeta(editingTask).label}</StatusBadge>
                {isTaskOpen(editingTask) && (
                  <span className="text-xs text-muted-foreground">{relativeDueLabel(editingTask.dueDate)}</span>
                )}
              </div>
            )}

            <TaskForm
              value={form}
              onChange={setForm}
              users={users}
              defaultExpanded={!!(form.description || form.category || form.isRecurring)}
              showStatus={!!editingTask}
              canSetCompleted={canCompleteEditing}
              canSetCanceled={isAdmin}
            />

            {editingTask && (editingTask.completedAt || editingTask.canceledAt || editingTask.createdAt) && (
              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Histórico</p>
                <p>Criada em {new Date(editingTask.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                {editingTask.completedAt && <p className="text-success">Contato feito — concluída em {new Date(editingTask.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                {editingTask.canceledAt && (
                  <p>Contato não feito — cancelada em {new Date(editingTask.canceledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}{editingTask.canceledReason ? `: "${editingTask.canceledReason}"` : ''}</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
              <div className="flex gap-2">
                {editingTask && isTaskOpen(editingTask) && canCompleteEditing && (
                  <button type="button" onClick={() => setStatus(editingTask.id, 'COMPLETED')} className="rounded-lg border border-success/30 px-3 py-2 text-sm font-medium text-success hover:bg-success/10">
                    Concluir
                  </button>
                )}
                {editingTask && isTaskOpen(editingTask) && isAdmin && (
                  <button type="button" onClick={() => cancelarComMotivo(editingTask.id)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                    Cancelar tarefa
                  </button>
                )}
                {editingTask && isAdmin && (
                  <button type="button" onClick={() => remove(editingTask.id)} className="rounded-lg border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">
                    Excluir
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => (editingTask ? abrirLista() : setFormOpen(false))} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                  Voltar
                </button>
                <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                  {busy ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </form>
        ) : tasks === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : tasks.length === 0 ? (
          !permError && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa criada para esta conversa.</p>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <TaskListItem
                key={t.id}
                task={t}
                currentUserId={me?.id ?? ''}
                isAdmin={isAdmin}
                onOpen={abrirVer}
                onComplete={(id) => setStatus(id, 'COMPLETED')}
              />
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default ConversationTasks;
