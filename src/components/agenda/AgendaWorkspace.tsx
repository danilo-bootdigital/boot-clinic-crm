'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/loading-state'
import { cn } from '@/lib/utils'
import { AgendaToolbar } from './AgendaToolbar'
import { AgendaFilters } from './AgendaFilters'
import { AgendaKpis } from './AgendaKpis'
import { AgendaDayView } from './AgendaDayView'
import { AgendaWeekView } from './AgendaWeekView'
import { AgendaMonthView } from './AgendaMonthView'
import { DayDrawer } from './DayDrawer'
import { statusMeta, STATUS_LEGEND } from './appointment-meta'
import {
  periodRange,
  shiftCursor,
  ymd,
  type AgendaView,
} from './agenda-utils'
import { EMPTY_FILTERS, type AgendaFiltersState, type Appointment, type Professional, type ScheduleBlock } from './types'

const VIEW_KEY = 'agenda.view'
const PROF_KEY = 'agenda.professionalId'

interface AgendaWorkspaceProps {
  professionals: Professional[]
  /** abre o formulário de criação (pré-preenchendo profissional/data quando houver) */
  onNew: (opts?: { professionalId?: string; date?: Date }) => void
  /** abre o detalhe de um agendamento */
  onSelect: (a: Appointment) => void
  /** muda quando uma operação externa (criar/cancelar/etc.) exige refetch */
  refreshKey: number
}

function readStored(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return window.localStorage.getItem(key) ?? fallback
}

/** Orquestrador da agenda premium: toolbar + KPIs + Dia/Semana/Mês + drawer. */
export function AgendaWorkspace({ professionals, onNew, onSelect, refreshKey }: AgendaWorkspaceProps) {
  const router = useRouter()
  const [view, setView] = useState<AgendaView>(() => readStored(VIEW_KEY, 'day') as AgendaView)
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const [professionalId, setProfessionalId] = useState<string>(() => readStored(PROF_KEY, ''))
  const [filters, setFilters] = useState<AgendaFiltersState>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [drawerDate, setDrawerDate] = useState<Date | null>(null)

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [specialties, setSpecialties] = useState<{ id: string; name: string }[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Persistência de view + profissional.
  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, view)
  }, [view])
  useEffect(() => {
    window.localStorage.setItem(PROF_KEY, professionalId)
  }, [professionalId])

  // Especialidades + salas p/ os filtros (uma vez).
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/specialties').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/rooms').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([s, r]) => {
        if (!alive) return
        setSpecialties(Array.isArray(s) ? s : [])
        setRooms(Array.isArray(r) ? r.map((x: any) => ({ id: x.id, name: x.name })) : [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const range = useMemo(() => periodRange(view, cursor), [view, cursor])
  const rangeKey = `${ymd(range.from)}_${ymd(range.to)}`

  // Busca agendamentos + bloqueios do período (1 request cada, via from/to).
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ from: ymd(range.from), to: ymd(range.to) })
    if (professionalId) qs.set('professionalId', professionalId)

    Promise.all([
      fetch(`/api/agenda/appointments?${qs}`, { signal: ctrl.signal, cache: 'no-store' }),
      fetch(`/api/schedule-blocks?${qs}`, { signal: ctrl.signal, cache: 'no-store' }),
    ])
      .then(async ([aRes, bRes]) => {
        if (aRes.status === 401) {
          router.push('/login?redirect=/agenda')
          return
        }
        const a = aRes.ok ? await aRes.json() : []
        const b = bRes.ok ? await bRes.json() : []
        setAppointments(Array.isArray(a) ? a : [])
        setBlocks(Array.isArray(b) ? b : [])
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setError('Falha ao carregar a agenda.')
      })
      .finally(() => setLoading(false))

    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, professionalId, refreshKey])

  // Filtros avançados aplicados sobre os dados carregados (sem reload).
  const filtered = useMemo(() => {
    const q = filters.patient.trim().toLowerCase()
    return appointments.filter((a) => {
      if (filters.specialtyId && a.specialtyId !== filters.specialtyId) return false
      if (filters.roomId && a.roomId !== filters.roomId) return false
      if (filters.status && a.status !== filters.status) return false
      if (filters.type && a.type !== filters.type) return false
      if (q && !(a.patient?.name ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [appointments, filters])

  const filtersActive = useMemo(
    () =>
      [filters.specialtyId, filters.roomId, filters.status, filters.type, filters.patient].filter(
        (v) => v.trim(),
      ).length,
    [filters],
  )

  const professionalCount = professionalId ? 1 : Math.max(1, professionals.length)
  const daysInPeriod =
    view === 'day' ? 1 : view === 'week' ? 7 : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()

  // Handlers de navegação.
  const goToday = useCallback(() => setCursor(new Date()), [])
  const goPrev = useCallback(() => setCursor((c) => shiftCursor(view, c, -1)), [view])
  const goNext = useCallback(() => setCursor((c) => shiftCursor(view, c, 1)), [view])
  const patchFilters = useCallback((p: Partial<AgendaFiltersState>) => setFilters((f) => ({ ...f, ...p })), [])

  return (
    <div className="space-y-4">
      <AgendaToolbar
        view={view}
        cursor={cursor}
        professionalId={professionalId}
        professionals={professionals}
        filtersActive={filtersActive}
        onView={setView}
        onToday={goToday}
        onPrev={goPrev}
        onNext={goNext}
        onProfessional={setProfessionalId}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
        onNew={() => onNew({ professionalId: professionalId || undefined })}
      />

      <AgendaFilters
        open={filtersOpen}
        filters={filters}
        specialties={specialties}
        rooms={rooms}
        onChange={patchFilters}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      <AgendaKpis
        view={view}
        appointments={filtered}
        blocks={blocks}
        daysInPeriod={daysInPeriod}
        professionalCount={professionalCount}
        loading={loading}
      />

      {/* Legenda de status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {STATUS_LEGEND.map((s) => {
          const m = statusMeta(s)
          return (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', m.solid)} />
              {m.label}
            </span>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-[60vh] w-full rounded-xl" />
      ) : view === 'day' ? (
        <AgendaDayView
          date={cursor}
          appointments={filtered}
          blocks={blocks}
          professionals={professionals}
          professionalId={professionalId}
          onSelect={onSelect}
          onNew={() => onNew({ professionalId: professionalId || undefined, date: cursor })}
        />
      ) : view === 'week' ? (
        <AgendaWeekView
          cursor={cursor}
          appointments={filtered}
          blocks={blocks}
          professionalId={professionalId}
          onSelect={onSelect}
        />
      ) : (
        <AgendaMonthView
          cursor={cursor}
          appointments={filtered}
          blocks={blocks}
          onSelectDay={setDrawerDate}
        />
      )}

      <DayDrawer
        date={drawerDate}
        appointments={filtered}
        blocks={blocks}
        onClose={() => setDrawerDate(null)}
        onSelect={(a) => {
          setDrawerDate(null)
          onSelect(a)
        }}
        onNew={(d) => {
          setDrawerDate(null)
          onNew({ professionalId: professionalId || undefined, date: d })
        }}
      />
    </div>
  )
}
