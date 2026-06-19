'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, CalendarDays } from 'lucide-react'
import { AgendaView } from '@/components/agenda/AgendaView'
import { AppointmentForm } from '@/components/agenda/AppointmentForm'
import { Rooms } from '@/components/agenda/Rooms'
import { Specialties } from '@/components/agenda/Specialties'
import { ScheduleBlocks } from '@/components/agenda/ScheduleBlocks'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ActionButton } from '@/components/ui/action-button'
import { Tabs } from '@/components/ui/tabs'

type Tab = 'agenda' | 'salas' | 'especialidades' | 'bloqueios'
type Mode = 'grid' | 'create' | 'detail'

const TABS: { key: Tab; label: string }[] = [
  { key: 'agenda', label: 'Agenda' },
  { key: 'salas', label: 'Salas' },
  { key: 'especialidades', label: 'Especialidades' },
  { key: 'bloqueios', label: 'Bloqueios' },
]

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', CONFIRMED: 'Confirmado', CANCELED: 'Cancelado',
  RESCHEDULED: 'Remarcado', ATTENDED: 'Compareceu', NO_SHOW: 'Faltou',
}

export default function AgendaPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('agenda')
  const [mode, setMode] = useState<Mode>('grid')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [professionals, setProfessionals] = useState<any[]>([])
  const [professionalId, setProfessionalId] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadProfessionals = useCallback(async () => {
    const res = await fetch('/api/professionals', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/agenda'); return }
    if (res.ok) setProfessionals(await res.json())
  }, [router])

  useEffect(() => { loadProfessionals() }, [loadProfessionals])

  async function handleCreate(data: any) {
    setError(null)
    const res = await fetch('/api/agenda/appointments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setError(e.error || 'Falha ao criar agendamento')
      return
    }
    setMode('grid'); setRefreshKey((k) => k + 1)
  }

  async function operation(action: string, extra: any = {}) {
    if (!selected) return
    setError(null)
    const res = await fetch(`/api/agenda/appointments/${selected.id}/operations`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setError(e.error || 'Falha na operação')
      return
    }
    setMode('grid'); setSelected(null); setRefreshKey((k) => k + 1)
  }

  async function removeAppointment() {
    if (!selected || !confirm('Excluir este agendamento?')) return
    await fetch(`/api/agenda/appointments/${selected.id}`, { method: 'DELETE' })
    setMode('grid'); setSelected(null); setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda Médica"
        description="Agendamentos, profissionais, salas e bloqueios"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          tab === 'agenda' && mode === 'grid' ? (
            <ActionButton icon={<Plus />} onClick={() => { setSelected(null); setMode('create') }}>Novo Agendamento</ActionButton>
          ) : mode !== 'grid' ? (
            <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setMode('grid'); setSelected(null); setError(null) }}>Voltar</ActionButton>
          ) : null
        }
      />

      {/* Abas */}
      <Tabs
        value={tab}
        onValueChange={(v) => { setTab(v as Tab); setMode('grid'); setSelected(null); setError(null) }}
        items={TABS.map((t) => ({ value: t.key, label: t.label }))}
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {tab === 'agenda' && mode === 'grid' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm" />
            <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm">
              <option value="">Todos os profissionais</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <SectionCard>
            <AgendaView
              key={`${date}-${professionalId}-${refreshKey}`}
              selectedDate={new Date(`${date}T12:00:00`)}
              professionalId={professionalId || undefined}
              onAppointmentClick={(a) => { setSelected(a); setMode('detail') }}
            />
          </SectionCard>
        </div>
      )}

      {tab === 'agenda' && mode === 'create' && (
        <SectionCard title="Novo Agendamento">
          <AppointmentForm defaultProfessionalId={professionalId || undefined} onSubmit={handleCreate} onCancel={() => setMode('grid')} />
        </SectionCard>
      )}

      {tab === 'agenda' && mode === 'detail' && selected && (
        <SectionCard title={selected.patient?.name || 'Agendamento'} className="max-w-2xl">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><dt className="text-muted-foreground">Profissional</dt><dd>{selected.professional?.name || '—'}</dd></div>
            <div><dt className="text-muted-foreground">Especialidade</dt><dd>{selected.specialty?.name || '—'}</dd></div>
            <div><dt className="text-muted-foreground">Início</dt><dd>{selected.startAt ? new Date(selected.startAt).toLocaleString('pt-BR') : '—'}</dd></div>
            <div><dt className="text-muted-foreground">Tipo</dt><dd>{selected.type || '—'}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd>{STATUS_LABELS[selected.status] || selected.status}</dd></div>
          </dl>
          {selected.notes && <p className="mt-3 text-sm text-muted-foreground">{selected.notes}</p>}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <ActionButton onClick={() => operation('confirm')}>Confirmar</ActionButton>
            <ActionButton variant="outline" onClick={() => operation('attend')}>Compareceu</ActionButton>
            <ActionButton variant="outline" onClick={() => operation('no_show')}>Faltou</ActionButton>
            <ActionButton variant="outline" onClick={() => operation('cancel', { cancellationReason: 'Cancelado pela clínica' })} className="border-destructive/30 text-destructive hover:bg-destructive/10">Cancelar</ActionButton>
            <ActionButton variant="outline" onClick={removeAppointment} className="border-destructive/30 text-destructive hover:bg-destructive/10">Excluir</ActionButton>
          </div>
        </SectionCard>
      )}

      {tab === 'salas' && <Rooms />}
      {tab === 'especialidades' && <Specialties />}
      {tab === 'bloqueios' && <ScheduleBlocks />}
    </div>
  )
}
