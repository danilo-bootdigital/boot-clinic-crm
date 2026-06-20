'use client'

import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { GridColumn, TimeAxis } from './TimeGrid'
import { isToday } from './agenda-utils'
import type { Appointment, Professional, ScheduleBlock } from './types'

interface AgendaDayViewProps {
  date: Date
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  professionals: Professional[]
  professionalId: string
  onSelect: (a: Appointment) => void
  onNew: () => void
}

/** Visão DIA: colunas por profissional (ou coluna única quando filtrado). */
export function AgendaDayView({
  date,
  appointments,
  blocks,
  professionals,
  professionalId,
  onSelect,
  onNew,
}: AgendaDayViewProps) {
  const columns = useMemo(() => {
    if (professionalId) {
      const name = professionals.find((p) => p.id === professionalId)?.name ?? 'Profissional'
      return [{ id: professionalId, name }]
    }
    const ids = Array.from(new Set(appointments.map((a) => a.professionalId)))
    const cols = ids
      .map((id) => ({
        id,
        name:
          professionals.find((p) => p.id === id)?.name ??
          appointments.find((a) => a.professionalId === id)?.professional?.name ??
          'Profissional',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return cols.length ? cols : [{ id: '', name: 'Agenda' }]
  }, [appointments, professionals, professionalId])

  const empty = appointments.length === 0 && blocks.length === 0

  if (empty) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Nenhum agendamento neste dia"
          description="Crie um novo agendamento ou navegue para outra data."
          action={
            <button
              type="button"
              onClick={onNew}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Novo Agendamento
            </button>
          }
        />
      </div>
    )
  }

  const colWidth = columns.length > 1 ? 'min-w-[220px]' : 'min-w-[420px]'

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="max-h-[70vh] overflow-auto scrollbar-thin">
        <div className="min-w-fit">
          {/* Cabeçalho de colunas (sticky) */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-card">
            <div className="sticky left-0 z-40 w-14 shrink-0 bg-card" />
            {columns.map((c) => (
              <div
                key={c.id || 'all'}
                className={cn(
                  'flex-1 border-l border-border px-3 py-2.5 text-center',
                  colWidth,
                )}
              >
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
              </div>
            ))}
          </div>

          {/* Corpo */}
          <div className="flex">
            <div className="sticky left-0 z-20 bg-card">
              <TimeAxis />
            </div>
            {columns.map((c) => {
              const colAppts = c.id
                ? appointments.filter((a) => a.professionalId === c.id)
                : appointments
              const colBlocks = c.id ? blocks.filter((b) => b.professionalId === c.id) : blocks
              return (
                <div key={c.id || 'all'} className={cn('border-l border-border', colWidth, 'flex-1')}>
                  <GridColumn
                    date={date}
                    appointments={colAppts}
                    blocks={colBlocks}
                    onSelect={onSelect}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {isToday(date) && (
        <div className="border-t border-border bg-muted/40 px-4 py-1.5 text-center text-xs text-muted-foreground">
          Hoje
        </div>
      )}
    </div>
  )
}
