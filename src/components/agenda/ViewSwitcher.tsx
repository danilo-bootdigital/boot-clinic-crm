'use client'

import { cn } from '@/lib/utils'
import type { AgendaView } from './agenda-utils'

const OPTIONS: { value: AgendaView; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
]

interface ViewSwitcherProps {
  value: AgendaView
  onChange: (v: AgendaView) => void
  className?: string
}

/** Segmented control premium para alternar Dia / Semana / Mês. */
export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Visualização da agenda"
      className={cn('inline-flex rounded-lg border border-border bg-muted/60 p-0.5', className)}
    >
      {OPTIONS.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              active
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
