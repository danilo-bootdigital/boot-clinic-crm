'use client'

import { X } from 'lucide-react'
import { FilterSelect } from '@/components/ui/filter-bar'
import { SearchInput } from '@/components/ui/search-input'
import { statusMeta } from './appointment-meta'
import type { AgendaFiltersState } from './types'

const STATUS_OPTIONS = ['CONFIRMED', 'PENDING', 'ATTENDED', 'NO_SHOW', 'CANCELED', 'RESCHEDULED']
const TYPE_OPTIONS = ['Consulta', 'Retorno', 'Exame', 'Avaliação']

interface AgendaFiltersProps {
  open: boolean
  filters: AgendaFiltersState
  specialties: { id: string; name: string }[]
  rooms: { id: string; name: string }[]
  onChange: (patch: Partial<AgendaFiltersState>) => void
  onClear: () => void
}

/**
 * Painel de filtros avançados (paciente · especialidade · sala · status · tipo).
 * Profissional fica na toolbar (server-side); estes são aplicados sobre os dados
 * já carregados do período — sem reload.
 */
export function AgendaFilters({ open, filters, specialties, rooms, onChange, onClear }: AgendaFiltersProps) {
  if (!open) return null
  const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground'
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div>
          <label className={labelCls}>Paciente</label>
          <SearchInput
            value={filters.patient}
            onChange={(v) => onChange({ patient: v })}
            placeholder="Buscar por nome…"
            containerClassName="max-w-none"
          />
        </div>
        <div>
          <label className={labelCls}>Especialidade</label>
          <FilterSelect
            className="w-full"
            value={filters.specialtyId}
            onChange={(e) => onChange({ specialtyId: e.target.value })}
          >
            <option value="">Todas</option>
            {specialties.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div>
          <label className={labelCls}>Sala</label>
          <FilterSelect
            className="w-full"
            value={filters.roomId}
            onChange={(e) => onChange({ roomId: e.target.value })}
          >
            <option value="">Todas</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <FilterSelect
            className="w-full"
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusMeta(s).label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <FilterSelect
            className="w-full"
            value={filters.type}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            <option value="">Todos</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Limpar filtros
        </button>
      </div>
    </div>
  )
}
