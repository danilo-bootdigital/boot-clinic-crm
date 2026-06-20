'use client'

import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import { ActionButton } from '@/components/ui/action-button'
import { FilterSelect } from '@/components/ui/filter-bar'
import { cn } from '@/lib/utils'
import { ViewSwitcher } from './ViewSwitcher'
import { periodLabel, type AgendaView } from './agenda-utils'
import type { Professional } from './types'

interface AgendaToolbarProps {
  view: AgendaView
  cursor: Date
  professionalId: string
  professionals: Professional[]
  filtersActive: number
  onView: (v: AgendaView) => void
  onToday: () => void
  onPrev: () => void
  onNext: () => void
  onProfessional: (id: string) => void
  onToggleFilters: () => void
  onNew: () => void
}

/** Cabeçalho da agenda: Hoje · ‹ período › · Dia/Semana/Mês · Profissional · Filtros · Novo. */
export function AgendaToolbar({
  view,
  cursor,
  professionalId,
  professionals,
  filtersActive,
  onView,
  onToday,
  onPrev,
  onNext,
  onProfessional,
  onToggleFilters,
  onNew,
}: AgendaToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
      <ActionButton variant="outline" onClick={onToday} className="shrink-0">
        Hoje
      </ActionButton>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Período anterior"
          onClick={onPrev}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Próximo período"
          onClick={onNext}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <h2 className="min-w-0 flex-1 truncate text-base font-semibold capitalize text-foreground sm:text-lg">
        {periodLabel(view, cursor)}
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitcher value={view} onChange={onView} />

        <FilterSelect
          value={professionalId}
          onChange={(e) => onProfessional(e.target.value)}
          className="w-auto min-w-[180px]"
          aria-label="Filtrar por profissional"
        >
          <option value="">Todos os profissionais</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>

        <button
          type="button"
          onClick={onToggleFilters}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted',
            filtersActive > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {filtersActive > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
              {filtersActive}
            </span>
          )}
        </button>

        <ActionButton icon={<Plus />} onClick={onNew} className="shrink-0">
          Novo Agendamento
        </ActionButton>
      </div>
    </div>
  )
}
