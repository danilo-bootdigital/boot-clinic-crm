'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { GridColumn, TimeAxis } from './TimeGrid'
import { isToday, weekDays, weekdayShort, ymd } from './agenda-utils'
import type { Appointment, ScheduleBlock } from './types'

interface AgendaWeekViewProps {
  cursor: Date
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  professionalId: string
  onSelect: (a: Appointment) => void
}

/** Visão SEMANA: 7 colunas (Seg→Dom) estilo Google Calendar. */
export function AgendaWeekView({
  cursor,
  appointments,
  blocks,
  professionalId,
  onSelect,
}: AgendaWeekViewProps) {
  const days = useMemo(() => weekDays(cursor), [cursor])

  // Agrupa por dia uma vez (evita refiltrar 7×).
  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const a of appointments) {
      const key = ymd(new Date(a.startAt))
      ;(map[key] ??= []).push(a)
    }
    return map
  }, [appointments])

  const blocksByDay = useMemo(() => {
    const map: Record<string, ScheduleBlock[]> = {}
    for (const b of blocks) (map[b.date] ??= []).push(b)
    return map
  }, [blocks])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="max-h-[72vh] overflow-auto scrollbar-thin">
        <div className="min-w-[760px]">
          {/* Cabeçalho dos dias (sticky) */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-card">
            <div className="sticky left-0 z-40 w-14 shrink-0 bg-card" />
            {days.map((d) => {
              const today = isToday(d)
              return (
                <div
                  key={ymd(d)}
                  className="flex-1 border-l border-border px-2 py-2 text-center"
                >
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {weekdayShort(d)}
                  </p>
                  <p
                    className={cn(
                      'mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold',
                      today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {d.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Corpo */}
          <div className="flex">
            <div className="sticky left-0 z-20 bg-card">
              <TimeAxis />
            </div>
            {days.map((d) => (
              <div key={ymd(d)} className="flex-1 border-l border-border">
                <GridColumn
                  date={d}
                  appointments={byDay[ymd(d)] ?? []}
                  blocks={blocksByDay[ymd(d)] ?? []}
                  onSelect={onSelect}
                  showProfessional={!professionalId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
