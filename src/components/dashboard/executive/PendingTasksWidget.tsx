'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListTodo, Plus } from 'lucide-react';
import { SectionCard } from '@/components/ui/section-card';
import { ActionButton } from '@/components/ui/action-button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { TaskListItem } from '@/components/tasks/TaskListItem';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { emptyTaskForm, type TaskFormValue } from '@/components/tasks/TaskForm';

const ADMIN_ROLES = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];
const WIDGET_LIMIT = 5;

/**
 * "Pendências da semana" — resumo de Tarefas no Dashboard principal. Mostra
 * só o topo (atrasadas primeiro, depois hoje, depois a semana) e aponta para
 * /tarefas para o resto: não vira uma segunda página do módulo.
 */
export function PendingTasksWidget() {
  const router = useRouter();
  const [me, setMe] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<TaskFormValue>(emptyTaskForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe);
    fetch('/api/users').then((r) => (r.ok ? r.json() : [])).then(setUsers);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/followup/tasks?filter=open&pageSize=${WIDGET_LIMIT}`, { cache: 'no-store' });
    if (res.ok) {
      const d = await res.json();
      setTasks(d.tasks ?? []);
      setCounts(d.counts ?? {});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function quickComplete(id: string) {
    await fetch(`/api/followup/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }),
    });
    load();
  }

  function abrirNova() {
    setForm(emptyTaskForm(me?.id ?? ''));
    setError(null);
    setDrawerOpen(true);
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/followup/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, category: form.category.trim() }),
    });
    setBusy(false);
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar tarefa'); return; }
    setDrawerOpen(false);
    load();
  }

  const isAdmin = me ? ADMIN_ROLES.includes(me.role) : false;
  // Mesma lógica de "mostra tudo enquanto carrega" da sidebar — evita piscar;
  // só some depois de confirmar que a clínica/usuário não tem o módulo.
  const visible = !me || (me.modules?.includes('followup') && me.permissions?.followup !== 'none');
  if (!visible) return null;

  return (
    <SectionCard
      title="Pendências da semana"
      description={loading ? undefined : `${counts.open ?? 0} pendente(s) · ${counts.overdue ?? 0} atrasada(s)`}
    >
      {loading ? (
        <LoadingState rows={3} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-6 w-6" />}
          title="Nenhuma pendência"
          description="Tudo em dia por aqui."
          action={<ActionButton icon={<Plus className="h-4 w-4" />} onClick={abrirNova}>Nova tarefa</ActionButton>}
        />
      ) : (
        <>
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <TaskListItem
                key={t.id}
                task={t}
                currentUserId={me?.id ?? ''}
                isAdmin={isAdmin}
                onOpen={() => router.push('/tarefas')}
                onComplete={quickComplete}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <ActionButton variant="outline" icon={<Plus className="h-4 w-4" />} onClick={abrirNova}>Nova tarefa</ActionButton>
            <button type="button" onClick={() => router.push('/tarefas')} className="text-sm font-semibold text-primary hover:underline">
              Ver todas
            </button>
          </div>
        </>
      )}

      <TaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editingTask={null}
        form={form}
        setForm={setForm}
        users={users}
        patients={[]}
        onSubmit={criar}
        busy={busy}
        error={error}
        canComplete={false}
        canCancel={false}
        canDelete={false}
        onComplete={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </SectionCard>
  );
}

export default PendingTasksWidget;
