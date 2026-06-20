'use client'

import { useMemo } from 'react'
import { CalendarPlus, CalendarX2 } from 'lucide-react'
import { Drawer } from '@/components/ui/drawer'
import { StatusPill } from './StatusPill'
import { fmtTime, ymd } from './agenda-utils'
import type { Appointment, ScheduleBlock } from './types'

interface DayDrawerProps {
  date: Date | null
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  onClose: () => void
  onSelect: (a: Appointment) => void
  onNew: (date: Date) => void
}

/** Drawer lateral com os agendamentos de um dia (acionado pela visão Mês). */
export function DayDrawer({ date, appointments, blocks, onClose, onSelect, onNew }: DayDrawerProps) {
  const dayAppts = useMemo(() => {
    if (!date) return []
    const k = ymd(date)
    return appointments
      .filter((a) => ymd(new Date(a.startAt)) === k)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }, [appointments, date])

  const dayBlocks = useMemo(() => {
    if (!date) return []
    const k = ymd(date)
    return blocks.filter((b) => b.date === k)
  }, [blocks, date])

  const title = date
    ? date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <Drawer
      open={!!date}
      onClose={onClose}
      title={<span className="capitalize">{title}</span>}
      description={`${dayAppts.length} agendamento(s)${dayBlocks.length ? ` · ${dayBlocks.length} bloqueio(s)` : ''}`}
    >
      <div className="space-y-2">
        {date && (
          <button
            type="button"
            onClick={() => onNew(date)}
            className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <CalendarPlus className="h-4 w-4" />
            Novo agendamento neste dia
          </button>
        )}

        {dayAppts.length === 0 && dayBlocks.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <CalendarX2 className="h-8 w-8" />
            <p className="text-sm">Nenhum agendamento neste dia.</p>
          </div>
        )}

        {dayAppts.map((a) => (
          <button
            type="button"
            key={a.id}
            onClick={() => onSelect(a)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {fmtTime(a.startAt)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {a.patient?.name ?? 'Paciente'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {a.type}
                {a.professional?.name ? ` · ${a.professional.name}` : ''}
              </p>
            </div>
            <StatusPill status={a.status} />
          </button>
        ))}

        {dayBlocks.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3"
          >
            <div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
              {b.startTime}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-muted-foreground">
                Bloqueio{b.reason ? ` · ${b.reason}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.startTime}–{b.endTime}
              </p>
            </div>
            <StatusPill status="BLOCK" />
          </div>
        ))}
      </div>
    </Drawer>
  )
}
