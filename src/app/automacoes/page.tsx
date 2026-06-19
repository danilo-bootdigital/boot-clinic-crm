'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Workflow, Plus, ArrowLeft, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'

const EVENTS: [string, string][] = [
  ['PATIENT_CREATED', 'Quando um paciente é criado'],
  ['DEAL_WON', 'Quando uma oportunidade é ganha'],
  ['APPOINTMENT_CREATED', 'Quando uma consulta é agendada'],
]
const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENTS)
const ACTIONS: [string, string][] = [
  ['CREATE_FOLLOW_UP', 'Criar tarefa de follow-up'],
  ['SEND_NOTIFICATION', 'Criar notificação'],
]
const ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTIONS)
const label = 'block text-sm font-medium text-foreground mb-1'

export default function AutomacoesPage() {
  const router = useRouter()
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<any>({ name: '', event: 'PATIENT_CREATED', actionType: 'CREATE_FOLLOW_UP', title: '', dueInDays: 1, message: '' })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/automacoes/rules', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/automacoes'); return }
    if (res.status === 403) { setRules([]); setLoading(false); setError('Sem permissão para Automações.'); return }
    if (res.ok) setRules(await res.json())
    setLoading(false)
  }, [router])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    const config = form.actionType === 'CREATE_FOLLOW_UP' ? { title: form.title, dueInDays: Number(form.dueInDays) } : { title: form.title, message: form.message }
    const res = await fetch('/api/automacoes/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, event: form.event, actions: [{ actionType: form.actionType, config }] }) })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Falha ao criar automação'); return }
    setAdding(false); setForm({ name: '', event: 'PATIENT_CREATED', actionType: 'CREATE_FOLLOW_UP', title: '', dueInDays: 1, message: '' }); load()
  }
  async function toggle(r: any) {
    await fetch(`/api/automacoes/rules/${r.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !r.isActive }) }); load()
  }
  async function remove(r: any) {
    if (!confirm(`Remover a automação "${r.name}"?`)) return
    await fetch(`/api/automacoes/rules/${r.id}`, { method: 'DELETE' }); load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Gatilhos e ações automáticas para a rotina da clínica"
        icon={<Workflow className="h-5 w-5" />}
        actions={adding
          ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setAdding(false); setError(null) }}>Voltar</ActionButton>
          : <ActionButton icon={<Plus />} onClick={() => setAdding(true)}>Nova automação</ActionButton>}
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {adding ? (
        <SectionCard title="Nova automação">
          <form onSubmit={create} className="space-y-4 max-w-2xl">
            <div><label className={label}>Nome *</label><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className={label}>Quando (gatilho)</label><FilterSelect className="w-full" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })}>{EVENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</FilterSelect></div>
            <div><label className={label}>Então (ação)</label><FilterSelect className="w-full" value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</FilterSelect></div>
            <div><label className={label}>Título</label><Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Ligar para o paciente" /></div>
            {form.actionType === 'CREATE_FOLLOW_UP'
              ? <div><label className={label}>Vencimento (dias a partir de hoje)</label><Input type="number" min={0} className="w-full" value={form.dueInDays} onChange={(e) => setForm({ ...form, dueInDays: e.target.value })} /></div>
              : <div><label className={label}>Mensagem</label><Textarea className="w-full" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>}
            <div className="pt-2 border-t"><button type="submit" className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90">Criar automação</button></div>
          </form>
        </SectionCard>
      ) : loading ? <LoadingState rows={4} label="Carregando automações" />
        : rules.length === 0 ? <SectionCard><p className="text-sm text-muted-foreground">Nenhuma automação. Crie a primeira em "Nova automação".</p></SectionCard>
        : (
          <SectionCard title="Regras">
            <div className="divide-y divide-border">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                      <StatusBadge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Ativa' : 'Inativa'}</StatusBadge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {EVENT_LABEL[r.event] || r.event} → {r.actions.map((a: any) => ACTION_LABEL[a.actionType] || a.actionType).join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => toggle(r)} className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted">{r.isActive ? 'Desativar' : 'Ativar'}</button>
                    <button onClick={() => remove(r)} title="Remover" className="p-2 rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}
    </div>
  )
}
