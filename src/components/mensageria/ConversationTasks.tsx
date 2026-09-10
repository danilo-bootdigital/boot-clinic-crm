'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, ListChecks, Pencil, X } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import { isTaskOpen, relativeDueLabel, taskStatusMeta } from '@/lib/followup/task-status';

const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' };
const TYPES = ['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK'];
const TYPE_LABELS: Record<string, string> = { FOLLOW_UP: 'Follow-up', REMINDER: 'Lembrete', ALERT: 'Alerta', TASK: 'Tarefa' };

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO completo -> "YYYY-MM-DD" para preencher o <input type=date> na edição. */
function toDateInput(iso: string) {
  return String(iso).slice(0, 10);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const emptyForm = { title: '', dueDate: hoje(), priority: 'MEDIUM', type: 'FOLLOW_UP', description: '' };

/**
 * Tarefas da conversa: dois botões irmãos que falam com o MESMO módulo de
 * Follow-up (nome interno; a tela chama "Tarefas") usado na página central
 * `/tarefas` (mesma API, mesmo model — `/tarefas` ainda não foi componentizado como `components/clinical/Quotes`,
 * então este componente conversa direto com `/api/followup/tasks`).
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
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [permError, setPermError] = useState(false);
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null); // null = criando nova
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/followup/tasks?conversationId=${conversationId}`, { cache: 'no-store' });
    if (res.status === 403) { setPermError(true); setTasks([]); return; }
    setPermError(false);
    setTasks(res.ok ? await res.json() : []);
  }, [conversationId]);

  // Carrega ao trocar de conversa — o sino já nasce no estado certo assim que
  // o atendente abre o chat, antes de qualquer clique.
  useEffect(() => { load(); }, [load]);

  const abertas = (tasks ?? []).filter(isTaskOpen);
  // Reavalia "vencida" pelo relógio, não pelo campo `status` salvo — nada
  // transita pra OVERDUE sozinho no banco (exigiria um job de fundo).
  const vencidas = abertas.filter((t) => taskStatusMeta(t).label === 'Atrasada');

  function abrirCriar() {
    setForm(emptyForm);
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
      type: t.type,
      description: t.description || '',
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
    const res = editingTask
      ? await fetch(`/api/followup/tasks/${editingTask.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      : await fetch('/api/followup/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, conversationId, patientId: patientId || undefined }),
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

  const label = 'mb-1 block text-xs font-medium text-foreground';

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
            <div>
              <label className={label}>Título *</label>
              <Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Vencimento *</label>
                <Input type="date" className="w-full" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
              </div>
              <div>
                <label className={label}>Prioridade</label>
                <FilterSelect className="w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITY.map((x) => <option key={x} value={x}>{PRIORITY_LABELS[x]}</option>)}
                </FilterSelect>
              </div>
            </div>
            <div>
              <label className={label}>Tipo</label>
              <FilterSelect className="w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((x) => <option key={x} value={x}>{TYPE_LABELS[x]}</option>)}
              </FilterSelect>
            </div>
            <div>
              <label className={label}>Descrição</label>
              <Textarea className="w-full" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            {editingTask && (editingTask.completedAt || editingTask.canceledAt || editingTask.createdAt) && (
              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Histórico</p>
                <p>Criada em {formatDateTime(editingTask.createdAt)}</p>
                {editingTask.completedAt && <p className="text-success">Contato feito — concluída em {formatDateTime(editingTask.completedAt)}</p>}
                {editingTask.canceledAt && (
                  <p>Contato não feito — cancelada em {formatDateTime(editingTask.canceledAt)}{editingTask.canceledReason ? `: "${editingTask.canceledReason}"` : ''}</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
              <div className="flex gap-2">
                {editingTask && isTaskOpen(editingTask) && (
                  <>
                    <button type="button" onClick={() => setStatus(editingTask.id, 'COMPLETED')} className="rounded-lg border border-success/30 px-3 py-2 text-sm font-medium text-success hover:bg-success/10">
                      Concluir
                    </button>
                    <button type="button" onClick={() => cancelarComMotivo(editingTask.id)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
                      Cancelar tarefa
                    </button>
                  </>
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
            {tasks.map((t) => {
              const meta = taskStatusMeta(t);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <button type="button" onClick={() => abrirVer(t)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground group-hover:underline">{t.title}</span>
                      <StatusBadge tone={meta.tone as any}>{meta.label}</StatusBadge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {TYPE_LABELS[t.type]} · {PRIORITY_LABELS[t.priority]}
                      {isTaskOpen(t) ? ` · ${relativeDueLabel(t.dueDate)}` : ` · venceu em ${new Date(t.dueDate).toLocaleDateString('pt-BR')}`}
                    </p>
                    {t.description && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{t.description}</p>}
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => abrirVer(t)} title="Ver/editar" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    {isTaskOpen(t) && (
                      <>
                        <button onClick={() => setStatus(t.id, 'COMPLETED')} title="Concluir" className="rounded-md p-2 text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                        <button onClick={() => cancelarComMotivo(t.id)} title="Cancelar" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default ConversationTasks;
