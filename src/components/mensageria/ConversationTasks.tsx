'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, ListChecks, X } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FilterSelect } from '@/components/ui/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' };
const TYPES = ['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK'];
const TYPE_LABELS: Record<string, string> = { FOLLOW_UP: 'Follow-up', REMINDER: 'Lembrete', ALERT: 'Alerta', TASK: 'Tarefa' };
const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELED: 'Cancelada', OVERDUE: 'Atrasada' };
const STATUS_TONE: Record<string, any> = { PENDING: 'warning', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELED: 'neutral', OVERDUE: 'destructive' };

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const emptyForm = { title: '', dueDate: hoje(), priority: 'MEDIUM', type: 'FOLLOW_UP', description: '' };

/**
 * Tarefas da conversa: dois botões irmãos que falam com o MESMO módulo de
 * Follow-up usado na página central `/followup` (mesma API, mesmo model —
 * `/followup` ainda não foi componentizado como `components/clinical/Quotes`,
 * então este componente conversa direto com `/api/followup/tasks`).
 *
 * - "Nova tarefa": abre o drawer já no formulário de criação.
 * - Sino: carrega a lista assim que a conversa é selecionada — é a
 *   "notificação ao acessar a conversa" pedida. Fica vermelho com tarefa
 *   vencida, amarelo com pendente no prazo, neutro sem nada — sem precisar
 *   clicar para saber.
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
  const [creating, setCreating] = useState(false);
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

  const abertas = (tasks ?? []).filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const vencidas = abertas.filter((t) => new Date(t.dueDate).getTime() < Date.now());

  function abrirCriar() {
    setForm(emptyForm);
    setError(null);
    setCreating(true);
    setOpen(true);
  }
  function abrirLista() {
    setCreating(false);
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/followup/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, conversationId, patientId: patientId || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const er = await res.json().catch(() => ({}));
      setError(res.status === 403 ? 'Sem permissão no módulo Follow-up — peça para habilitar em Configurações.' : (er.error || 'Falha ao criar tarefa'));
      return;
    }
    setCreating(false);
    load();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/followup/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
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
          vencidas.length ? `${vencidas.length} tarefa(s) vencida(s) nesta conversa`
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
        title="Tarefas"
        description={creating ? 'Nova tarefa desta conversa' : undefined}
        width="max-w-lg"
      >
        {permError && (
          <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            Sem permissão no módulo Follow-up. Peça para habilitar em Configurações › Usuários.
          </p>
        )}

        {creating ? (
          <form onSubmit={create} className="space-y-4">
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
              <Textarea className="w-full" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                Cancelar
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {busy ? 'Salvando…' : 'Salvar tarefa'}
              </button>
            </div>
          </form>
        ) : tasks === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : tasks.length === 0 ? (
          !permError && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa criada para esta conversa.</p>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{t.title}</span>
                    <StatusBadge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status] || t.status}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TYPE_LABELS[t.type]} · {PRIORITY_LABELS[t.priority]} · vence {new Date(t.dueDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {t.status !== 'COMPLETED' && t.status !== 'CANCELED' && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setStatus(t.id, 'COMPLETED')} title="Concluir" className="rounded-md p-2 text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setStatus(t.id, 'CANCELED')} title="Cancelar" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default ConversationTasks;
