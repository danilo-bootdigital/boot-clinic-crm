'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { statusMeta } from './appointment-meta'
import {
  END_HOUR,
  START_HOUR,
  TOTAL_MINUTES,
  fmtTime,
  hourLabels,
  layoutColumn,
  minutesFromStart,
  ymd,
} from './agenda-utils'
import type { Appointment, ScheduleBlock } from './types'

export const HOUR_PX = 56
export const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX

/** Coluna de rótulos de hora (sticky à esquerda). */
export function TimeAxis() {
  return (
    <div className="w-14 shrink-0 select-none">
      <div style={{ height: GRID_HEIGHT }} className="relative">
        {hourLabels().map((h, i) => (
          <div
            key={h}
            style={{ top: i * HOUR_PX }}
            className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
          >
            {i === 0 ? '' : h}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Linhas de hora de fundo (sutil), compartilhadas por todas as colunas. */
function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {hourLabels().map((_, i) => (
        <div
          key={i}
          style={{ top: i * HOUR_PX, height: HOUR_PX }}
          className="absolute inset-x-0 border-t border-border/70"
        />
      ))}
    </div>
  )
}

interface GridColumnProps {
  date: Date
  appointments: Appointment[]
  blocks: ScheduleBlock[]
  onSelect: (a: Appointment) => void
  /** mostra o nome do profissional dentro do card (visão semana / múltiplos) */
  showProfessional?: boolean
  className?: string
}

/** Uma coluna de tempo com eventos posicionados e bloqueios ao fundo. */
export function GridColumn({
  date,
  appointments,
  blocks,
  onSelect,
  showProfessional,
  className,
}: GridColumnProps) {
  const positioned = useMemo(
    () =>
      layoutColumn(
        appointments.map((a) => ({
          ...a,
          start: new Date(a.startAt).getTime(),
          end: new Date(a.endAt).getTime(),
        })),
      ),
    [appointments],
  )

  const blockBands = useMemo(() => {
    const dStr = ymd(date)
    return blocks
      .filter((b) => b.date === dStr)
      .map((b) => {
        const [sh, sm] = b.startTime.split(':').map(Number)
        const [eh, em] = b.endTime.split(':').map(Number)
        const s = new Date(date)
        s.setHours(sh, sm, 0, 0)
        const e = new Date(date)
        e.setHours(eh, em, 0, 0)
        const top = (minutesFromStart(s) / TOTAL_MINUTES) * 100
        const height = Math.max(((minutesFromStart(e) - minutesFromStart(s)) / TOTAL_MINUTES) * 100, 1.5)
        return { id: b.id, top, height, reason: b.reason }
      })
  }, [blocks, date])

  return (
    <div className={cn('relative flex-1', className)} style={{ height: GRID_HEIGHT }}>
      <GridLines />

      {/* Bloqueios — faixa hachurada ao fundo */}
      {blockBands.map((b) => (
        <div
          key={b.id}
          title={`Bloqueio${b.reason ? ` · ${b.reason}` : ''}`}
          style={{ top: `${b.top}%`, height: `${b.height}%` }}
          className="absolute inset-x-0.5 rounded-md border border-dashed border-muted-foreground/30 bg-[repeating-linear-gradient(45deg,hsl(var(--muted)),hsl(var(--muted))_5px,transparent_5px,transparent_10px)]"
        />
      ))}

      {/* Eventos */}
      {positioned.map(({ item, top, height, lane, lanes }) => {
        const meta = statusMeta(item.status)
        const widthPct = 100 / lanes
        const compact = height < 7
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            title={`${item.patient?.name ?? 'Paciente'} · ${fmtTime(item.startAt)}–${fmtTime(item.endAt)} · ${meta.label}`}
            style={{
              top: `${top}%`,
              height: `${height}%`,
              left: `calc(${lane * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
            }}
            className={cn(
              'absolute z-10 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-card transition-all hover:z-20 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              meta.event,
            )}
          >
            <div className="flex items-center gap-1">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
              <span className="truncate text-xs font-semibold text-foreground">
                {item.patient?.name ?? 'Paciente'}
              </span>
            </div>
            {!compact && (
              <>
                <p className="truncate text-[11px] text-muted-foreground">
                  {fmtTime(item.startAt)}–{fmtTime(item.endAt)} · {item.type}
                </p>
                {showProfessional && item.professional?.name && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.professional.name}
                  </p>
                )}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
