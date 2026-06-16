'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat, Plus, ArrowLeft, Check, X, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'

const PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const PRIORITY_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', URGENT: 'Urgente' }
const TYPES = ['FOLLOW_UP', 'REMINDER', 'ALERT', 'TASK']
const TYPE_LABELS: Record<string, string> = { FOLLOW_UP: 'Follow-up', REMINDER: 'Lembrete', ALERT: 'Alerta', TASK: 'Tarefa' }
const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELED: 'Cancelada', OVERDUE: 'Atrasada' }
const STATUS_TONE: Record<string, any> = { PENDING: 'warning', IN_PROGRESS: 'info', COMPLETED: 'success', CANCELED: 'neutral', OVERDUE: 'destructive' }

export default function FollowUpPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', dueDate: new Date().toISOString().split('T')[0], priority: 'MEDIUM', type: 'FOLLOW_UP', patientId: '', description: '' })

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

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/followup/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao criar tarefa'); return }
    setCreating(false)
    setForm({ title: '', dueDate: new Date().toISOString().split('T')[0], priority: 'MEDIUM', type: 'FOLLOW_UP', patientId: '', description: '' })
    load()
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/followup/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }
  async function remove(id: string) {
    if (!confirm('Excluir esta tarefa?')) return
    await fetch(`/api/followup/tasks/${id}`, { method: 'DELETE' })
    load()
  }

  const field = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-up"
        description="Tarefas e acompanhamentos de relacionamento"
        icon={<Repeat className="h-5 w-5" />}
        actions={
          creating
            ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setError(null) }}>Voltar</ActionButton>
            : <ActionButton icon={<Plus />} onClick={() => setCreating(true)}>Nova Tarefa</ActionButton>
        }
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {creating ? (
        <SectionCard title="Nova Tarefa">
          <form onSubmit={create} className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
              <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label><input type="date" className={field} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label><select className={field} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITY.map((x) => <option key={x} value={x}>{PRIORITY_LABELS[x]}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label><select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((x) => <option key={x} value={x}>{TYPE_LABELS[x]}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Paciente</label><select className={field} value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}><option value="">—</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label><textarea className={field} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-3 pt-2 border-t"><button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">Salvar</button></div>
          </form>
        </SectionCard>
      ) : loading ? (
        <LoadingState rows={5} label="Carregando tarefas" />
      ) : tasks.length === 0 ? (
        <SectionCard><p className="text-sm text-muted-foreground">Nenhuma tarefa de follow-up. Crie a primeira em "Nova Tarefa".</p></SectionCard>
      ) : (
        <SectionCard>
          <div className="divide-y divide-border">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                    <StatusBadge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status] || t.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {TYPE_LABELS[t.type]} · {PRIORITY_LABELS[t.priority]} · vence {new Date(t.dueDate).toLocaleDateString('pt-BR')}
                    {t.patient ? ` · ${t.patient.name}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {t.status !== 'COMPLETED' && t.status !== 'CANCELED' && (
                    <>
                      <button onClick={() => setStatus(t.id, 'COMPLETED')} title="Concluir" className="p-2 rounded-md text-green-600 hover:bg-green-50"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setStatus(t.id, 'CANCELED')} title="Cancelar" className="p-2 rounded-md text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                    </>
                  )}
                  <button onClick={() => remove(t.id)} title="Excluir" className="p-2 rounded-md text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
