'use client'

import { useMemo } from 'react'
import { CalendarCheck2, CheckCircle2, Clock, Gauge, Ban } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { StatGridSkeleton } from '@/components/ui/loading-state'
import { TOTAL_MINUTES, type AgendaView } from './agenda-utils'
import type { Appointment, ScheduleBlock } from './types'

interface AgendaKpisProps {
  view: AgendaView
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  /** nº de dias no período (p/ taxa de ocupação) */
  daysInPeriod: number
  /** profissionais considerados (1 se filtrado, senão total ativo) */
  professionalCount: number
  loading: boolean
}

const PERIOD_HINT: Record<AgendaView, string> = {
  day: 'no dia',
  week: 'na semana',
  month: 'no mês',
}

/** Faixa de 5 KPIs derivada dos dados já carregados — respeita filtros e período. */
export function AgendaKpis({
  view,
  appointments,
  blocks,
  daysInPeriod,
  professionalCount,
  loading,
}: AgendaKpisProps) {
  const kpis = useMemo(() => {
    const active = appointments.filter((a) => a.status !== 'CANCELED')
    const confirmed = appointments.filter((a) => a.status === 'CONFIRMED').length
    const pending = appointments.filter((a) => a.status === 'PENDING').length

    // Ocupação = minutos agendados (não cancelados) / capacidade.
    const bookedMin = active.reduce((sum, a) => sum + (a.durationMinutes || 0), 0)
    const capacity = Math.max(1, professionalCount) * Math.max(1, daysInPeriod) * TOTAL_MINUTES
    const occupancy = Math.min(100, Math.round((bookedMin / capacity) * 100))

    return {
      total: active.length,
      confirmed,
      pending,
      occupancy,
      blocks: blocks.length,
    }
  }, [appointments, blocks, daysInPeriod, professionalCount])

  if (loading) return <StatGridSkeleton count={5} />

  const hint = PERIOD_HINT[view]
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Consultas"
        value={String(kpis.total)}
        hint={`Agendadas ${hint}`}
        tone="primary"
        icon={<CalendarCheck2 className="h-[18px] w-[18px]" />}
      />
      <StatCard
        label="Confirmados"
        value={String(kpis.confirmed)}
        hint={`Confirmados ${hint}`}
        tone="success"
        icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
      />
      <StatCard
        label="Pendentes"
        value={String(kpis.pending)}
        hint="Aguardando confirmação"
        tone="warning"
        icon={<Clock className="h-[18px] w-[18px]" />}
      />
      <StatCard
        label="Taxa de Ocupação"
        value={`${kpis.occupancy}%`}
        hint={`Capacidade ${hint}`}
        tone="primary"
        icon={<Gauge className="h-[18px] w-[18px]" />}
      />
      <StatCard
        label="Bloqueios"
        value={String(kpis.blocks)}
        hint={`Indisponibilidades ${hint}`}
        tone="muted"
        icon={<Ban className="h-[18px] w-[18px]" />}
      />
    </div>
  )
}
