'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { isToday, monthMatrix, weekdayShort, ymd } from './agenda-utils'
import type { Appointment, ScheduleBlock } from './types'

interface DayBucket {
  consultas: number
  retornos: number
  blocks: number
  total: number
}

interface AgendaMonthViewProps {
  cursor: Date
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  onSelectDay: (date: Date) => void
}

const WEEK_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/** Visão MÊS: calendário com contadores por dia; clique abre o drawer do dia. */
export function AgendaMonthView({ cursor, appointments, blocks, onSelectDay }: AgendaMonthViewProps) {
  const weeks = useMemo(() => monthMatrix(cursor), [cursor])

  const buckets = useMemo(() => {
    const map: Record<string, DayBucket> = {}
    const ensure = (k: string) => (map[k] ??= { consultas: 0, retornos: 0, blocks: 0, total: 0 })
    for (const a of appointments) {
      if (a.status === 'CANCELED') continue
      const k = ymd(new Date(a.startAt))
      const b = ensure(k)
      if (a.type === 'Retorno') b.retornos++
      else b.consultas++
      b.total++
    }
    for (const bl of blocks) ensure(bl.date).blocks++
    return map
  }, [appointments, blocks])

  const month = cursor.getMonth()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEK_HEADERS.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-xs font-semibold uppercase text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((d, i) => {
          const key = ymd(d)
          const inMonth = d.getMonth() === month
          const today = isToday(d)
          const b = buckets[key]
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDay(d)}
              className={cn(
                'group flex min-h-[104px] flex-col gap-1 border-b border-r border-border p-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                (i + 1) % 7 === 0 && 'border-r-0',
                !inMonth && 'bg-muted/20',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-sm font-semibold',
                  today
                    ? 'bg-primary text-primary-foreground'
                    : inMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/60',
                )}
              >
                {d.getDate()}
              </span>

              {b ? (
                <div className="mt-0.5 space-y-1">
                  {b.consultas > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {b.consultas} consulta{b.consultas > 1 ? 's' : ''}
                    </span>
                  )}
                  {b.retornos > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      {b.retornos} retorno{b.retornos > 1 ? 's' : ''}
                    </span>
                  )}
                  {b.blocks > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      {b.blocks} bloqueio{b.blocks > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ) : (
                inMonth && (
                  <span className="mt-1 text-[11px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                    Livre
                  </span>
                )
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
