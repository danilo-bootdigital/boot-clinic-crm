'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, Plus, ArrowLeft, Check, X, Trash2, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'
import { isTaskOpen, relativeDueLabel, taskStatusMeta } from '@/lib/followup/task-status'

const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' }
const TYPES = ['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']
const TYPE_LABELS: Record<string, string> = { FOLLOW_UP: 'Follow-up', REMINDER: 'Lembrete', ALERT: 'Alerta', TASK: 'Tarefa' }

/** ISO completo -> "YYYY-MM-DD" para preencher o <input type=date> na edição. */
function toDateInput(iso: string) {
  return String(iso).slice(0, 10)
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const emptyForm = { title: '', dueDate: new Date().toISOString().split('T')[0], priority: 'MEDIUM', type: 'FOLLOW_UP', patientId: '', description: '' }

export default function FollowUpPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<any | null>(null) // null = criando nova
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/followup/tasks', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/followup'); return }
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
    fetch('/api/patients?limit=100').then((r) => r.ok ? r.json() : { patients: [] }).then((d) => setPatients(d.patients ?? []))
  }, [load])

  function abrirNova() {
    setForm(emptyForm)
    setEditingTask(null)
    setError(null)
    setCreating(true)
  }

  function abrirVer(t: any) {
    setForm({
      title: t.title,
      dueDate: toDateInput(t.dueDate),
      priority: t.priority,
      type: t.type,
      patientId: t.patientId || '',
      description: t.description || '',
    })
    setEditingTask(t)
    setError(null)
    setCreating(true)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = editingTask
      ? await fetch(`/api/followup/tasks/${editingTask.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      : await fetch('/api/followup/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setBusy(false)
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar tarefa'); return }
    setCreating(false)
    setEditingTask(null)
    load()
  }

  async function setStatus(id: string, status: string, canceledReason?: string) {
    await fetch(`/api/followup/tasks/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(canceledReason !== undefined && { canceledReason }) }),
    })
    setCreating(false)
    setEditingTask(null)
    load()
  }

  function cancelarComMotivo(id: string) {
    const motivo = window.prompt('Motivo do cancelamento (opcional):')
    if (motivo === null) return // usuário cancelou o próprio prompt
    setStatus(id, 'CANCELED', motivo)
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta tarefa?')) return
    await fetch(`/api/followup/tasks/${id}`, { method: 'DELETE' })
    setCreating(false)
    setEditingTask(null)
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-up"
        description="Tarefas e acompanhamentos de relacionamento"
        icon={<Repeat className="h-5 w-5" />}
        actions={
          creating
            ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setEditingTask(null); setError(null) }}>Voltar</ActionButton>
            : <ActionButton icon={<Plus />} onClick={abrirNova}>Nova Tarefa</ActionButton>
        }
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {creating ? (
        <SectionCard title={editingTask ? 'Tarefa' : 'Nova Tarefa'}>
          <form onSubmit={salvar} className="space-y-4 max-w-2xl">
            {editingTask && (
              <div className="flex items-center gap-2">
                <StatusBadge tone={taskStatusMeta(editingTask).tone as any}>{taskStatusMeta(editingTask).label}</StatusBadge>
                {isTaskOpen(editingTask) && <span className="text-xs text-muted-foreground">{relativeDueLabel(editingTask.dueDate)}</span>}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
              <Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><label className="block text-sm font-medium text-foreground mb-1">Vencimento *</label><Input type="date" className="w-full" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Prioridade</label><FilterSelect className="w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITY.map((x) => <option key={x} value={x}>{PRIORITY_LABELS[x]}</option>)}</FilterSelect></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Tipo</label><FilterSelect className="w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((x) => <option key={x} value={x}>{TYPE_LABELS[x]}</option>)}</FilterSelect></div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Paciente</label><FilterSelect className="w-full" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}><option value="">—</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FilterSelect></div>
            </div>
            <div><label className="block text-sm font-medium text-foreground mb-1">Descrição</label><Textarea className="w-full" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

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

            <div className="flex flex-wrap justify-between gap-3 pt-2 border-t">
              <div className="flex gap-2">
                {editingTask && isTaskOpen(editingTask) && (
                  <>
                    <button type="button" onClick={() => setStatus(editingTask.id, 'COMPLETED')} className="rounded-md border border-success/30 px-3 py-2 text-sm font-medium text-success hover:bg-success/10">Concluir</button>
                    <button type="button" onClick={() => cancelarComMotivo(editingTask.id)} className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancelar tarefa</button>
                    <button type="button" onClick={() => remove(editingTask.id)} className="rounded-md border border-destructive/30 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">Excluir</button>
                  </>
                )}
              </div>
              <button type="submit" disabled={busy} className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-60">{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </SectionCard>
      ) : loading ? (
        <LoadingState rows={5} label="Carregando tarefas" />
      ) : tasks.length === 0 ? (
        <SectionCard><p className="text-sm text-muted-foreground">Nenhuma tarefa de follow-up. Crie a primeira em "Nova Tarefa".</p></SectionCard>
      ) : (
        <SectionCard>
          <div className="divide-y divide-border">
            {tasks.map((t) => {
              const meta = taskStatusMeta(t)
              return (
                <div key={t.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <button type="button" onClick={() => abrirVer(t)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                      <StatusBadge tone={meta.tone as any}>{meta.label}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TYPE_LABELS[t.type]} · {PRIORITY_LABELS[t.priority]}
                      {isTaskOpen(t) ? ` · ${relativeDueLabel(t.dueDate)}` : ` · venceu em ${new Date(t.dueDate).toLocaleDateString('pt-BR')}`}
                      {t.patient ? ` · ${t.patient.name}` : ''}
                    </p>
                    {t.description && <p className="mt-0.5 truncate text-xs text-muted-foreground/80">{t.description}</p>}
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => abrirVer(t)} title="Ver/editar" className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    {isTaskOpen(t) && (
                      <>
                        <button onClick={() => setStatus(t.id, 'COMPLETED')} title="Concluir" className="p-2 rounded-md text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                        <button onClick={() => cancelarComMotivo(t.id)} title="Cancelar" className="p-2 rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                      </>
                    )}
                    <button onClick={() => remove(t.id)} title="Excluir" className="p-2 rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
