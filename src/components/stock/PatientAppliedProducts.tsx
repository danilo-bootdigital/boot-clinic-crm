'use client'

import { useEffect, useState } from 'react'
import { Syringe } from 'lucide-react'
import { ControlledBadge, fmtDate, fmtDateTime, fmtQty } from './shared'

type Row = { id: string; occurredAt: string; quantity: number; snapshot: any }

/**
 * "Produtos aplicados" no paciente (Estoque, Fase 3): lote, validade, data e
 * profissional de cada aplicação. Some quando o estoque não responde (módulo
 * desligado / sem acesso) ou quando não há nada aplicado.
 */
export function PatientAppliedProducts({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    fetch(`/api/estoque/patients/${patientId}/applied`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
  }, [patientId])

  if (!rows || rows.length === 0) return null
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><Syringe className="h-4 w-4 text-muted-foreground" aria-hidden />Produtos aplicados</h3>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const s = r.snapshot ?? {}
          return (
            <li key={r.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">
                  {s.itemName} <span className="font-normal text-muted-foreground">— {fmtQty(Math.abs(r.quantity))} {s.baseUnit}</span>
                  {s.controlled && <span className="ml-2"><ControlledBadge list={s.controlledList} /></span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Lote {s.lotNumber}{s.expiresAt ? ` · val. ${fmtDate(s.expiresAt)}` : ''}{s.region ? ` · ${s.region}` : ''}{s.professionalName ? ` · ${s.professionalName}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(r.occurredAt)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
