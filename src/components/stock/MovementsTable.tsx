'use client'

import Link from 'next/link'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { MOVEMENT_LABELS, LOSS_REASON_LABELS } from '@/lib/stock-caps'
import { brl } from '@/lib/financial-format'
import { fmtDate, fmtDateTime, fmtQty } from './shared'

export type Movement = {
  id: string; type: string; itemId: string; quantity: number; unitCost?: number; totalCost?: number
  reason: string | null; reversalOfId: string | null; reversedAt: string | null; transferId: string | null
  occurredAt: string; createdByName: string; balanceAfter: number | null
  snapshot: { itemName?: string; baseUnit?: string; lotNumber?: string; expiresAt?: string | null; locationName?: string
    patientName?: string | null; professionalName?: string | null; toLocationName?: string; fromLocationName?: string
    controlled?: boolean; reversedType?: string } | null
}

const reasonText = (m: Movement) => {
  if (!m.reason) return null
  const [code, ...rest] = m.reason.split(': ')
  return m.type === 'PERDA' && LOSS_REASON_LABELS[code] ? [LOSS_REASON_LABELS[code], ...rest].join(': ') : m.reason
}

// Razão (kardex). O estorno nunca apaga: a linha original fica riscada como
// "estornada" e o estorno aparece como linha própria.
export function MovementsTable({ movements, showItem, showBalance, canViewCost, canReverse, onReverse }: {
  movements: Movement[]; showItem?: boolean; showBalance?: boolean; canViewCost: boolean
  canReverse: boolean; onReverse: (m: Movement) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Quando</th>
            <th className="px-4 py-3 font-medium">Movimento</th>
            {showItem && <th className="px-4 py-3 font-medium">Item</th>}
            <th className="px-4 py-3 font-medium">Local · lote</th>
            <th className="px-4 py-3 text-right font-medium">Qtd.</th>
            {showBalance && <th className="px-4 py-3 text-right font-medium">Saldo</th>}
            {canViewCost && <th className="px-4 py-3 text-right font-medium">Custo</th>}
            <th className="px-4 py-3 font-medium">Por</th>
            {canReverse && <th className="px-4 py-3"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {movements.map((m) => {
            const s = m.snapshot ?? {}
            const unit = s.baseUnit ?? ''
            const reversed = !!m.reversedAt
            return (
              <tr key={m.id} className={reversed ? 'align-top text-muted-foreground' : 'align-top'}>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDateTime(m.occurredAt)}</td>
                <td className="px-4 py-3">
                  <span className={reversed ? 'line-through' : 'font-medium'}>{MOVEMENT_LABELS[m.type] ?? m.type}</span>
                  {m.type === 'ESTORNO' && s.reversedType && <span className="text-xs text-muted-foreground"> de {MOVEMENT_LABELS[s.reversedType]?.toLowerCase()}</span>}
                  {reversed && <StatusBadge tone="neutral" className="ml-2">estornada</StatusBadge>}
                  {s.controlled && <StatusBadge tone="destructive" dot={false} className="ml-2">controlado</StatusBadge>}
                  {(s.toLocationName || s.fromLocationName) && (
                    <p className="text-xs text-muted-foreground">{s.toLocationName ? `para ${s.toLocationName}` : `de ${s.fromLocationName}`}</p>
                  )}
                  {s.patientName && <p className="text-xs text-muted-foreground">Paciente: {s.patientName}{s.professionalName ? ` · ${s.professionalName}` : ''}</p>}
                  {reasonText(m) && <p className="text-xs text-muted-foreground">{reasonText(m)}</p>}
                </td>
                {showItem && (
                  <td className="px-4 py-3">
                    <Link href={`/estoque/itens/${m.itemId}`} className="text-primary hover:underline">{s.itemName ?? '—'}</Link>
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  {s.locationName ?? '—'}
                  <span className="block text-xs">lote {s.lotNumber ?? '—'}{s.expiresAt ? ` · val. ${fmtDate(s.expiresAt)}` : ''}</span>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${m.quantity > 0 ? 'text-success' : 'text-destructive'}`}>
                  {m.quantity > 0 ? '+' : '−'}{fmtQty(Math.abs(m.quantity))} {unit}
                </td>
                {showBalance && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{m.balanceAfter == null ? '—' : `${fmtQty(m.balanceAfter)} ${unit}`}</td>}
                {canViewCost && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{m.totalCost == null ? '—' : brl(m.totalCost)}</td>}
                <td className="px-4 py-3 text-muted-foreground">{m.createdByName}</td>
                {canReverse && (
                  <td className="px-2 py-2 text-right">
                    {!reversed && m.type !== 'ESTORNO' && (
                      <Button size="sm" variant="ghost" onClick={() => onReverse(m)} aria-label="Estornar movimentação">
                        <Undo2 className="mr-1 h-3.5 w-3.5" />Estornar
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Pede o motivo e estorna (o servidor valida permissão, controlados e saldo).
export async function reverseWithPrompt(m: Movement): Promise<string | null> {
  const label = MOVEMENT_LABELS[m.type]?.toLowerCase() ?? 'movimentação'
  const extra = m.transferId ? ' As duas pernas da transferência serão estornadas.' : ''
  const reason = window.prompt(`Estornar ${label} de ${fmtQty(Math.abs(m.quantity))} ${m.snapshot?.baseUnit ?? ''}?${extra}\n\nMotivo do estorno:`)
  if (reason === null) return null
  if (reason.trim().length < 3) return 'Informe o motivo do estorno'
  const res = await fetch(`/api/estoque/movements/${m.id}/reverse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
  })
  if (res.ok) return ''
  return (await res.json().catch(() => ({}))).error || 'Não foi possível estornar'
}
