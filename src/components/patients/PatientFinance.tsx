'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleDollarSign, TrendingUp, Clock, AlertTriangle } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  brl, formatDate, RECEIVABLE_SOURCE_LABELS, RECEIVABLE_STATUS_LABELS,
  STATUS_TONE, PAYMENT_METHOD_LABELS,
} from '@/lib/financial-format'

interface Extrato {
  totals: { faturado: number; recebido: number; emAberto: number; vencido: number; count: number }
  receivables: any[]
}

/**
 * Aba Financeiro da ficha do paciente: totais + histórico de cobranças e baixas.
 *
 * Faturado e recebido são mostrados separados de propósito — criar cobrança não
 * é receita recebida. O saldo em aberto é a diferença entre os dois.
 */
export default function PatientFinance({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Extrato | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const load = useCallback(async () => {
    setCarregando(true)
    const res = await fetch(`/api/financeiro/patients/${patientId}`, { cache: 'no-store' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErro(j.error || 'Financeiro indisponível para o seu perfil.')
      setCarregando(false)
      return
    }
    setErro(null)
    setData(await res.json())
    setCarregando(false)
  }, [patientId])

  useEffect(() => { load() }, [load])

  if (carregando) return <SectionCard><p className="text-sm text-muted-foreground">Carregando…</p></SectionCard>
  if (erro) return <SectionCard><p className="text-sm text-muted-foreground">{erro}</p></SectionCard>
  if (!data) return null

  const { totals, receivables } = data

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total faturado" value={brl(totals.faturado)} icon={<CircleDollarSign className="h-4 w-4" />} tone="primary" hint={`${totals.count} cobrança(s)`} />
        <StatCard label="Total recebido" value={brl(totals.recebido)} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
        <StatCard label="Saldo em aberto" value={brl(totals.emAberto)} icon={<Clock className="h-4 w-4" />} tone="warning" />
        <StatCard label="Vencido" value={brl(totals.vencido)} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
      </div>

      <SectionCard title="Histórico de cobranças">
        {receivables.length === 0 ? (
          <EmptyState title="Nenhuma cobrança" description="Este paciente ainda não tem cobranças registradas." />
        ) : (
          <div className="space-y-3">
            {receivables.map((r: any) => {
              const baixas = (r.installments ?? []).flatMap((i: any) => i.payments ?? []).filter((p: any) => !p.reversedAt)
              return (
                <div key={r.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/financeiro/${r.id}`} className="font-medium text-primary hover:underline">
                          {r.description}
                        </Link>
                        <StatusBadge tone="neutral">
                          {RECEIVABLE_SOURCE_LABELS[r.sourceType || ''] || '—'}
                        </StatusBadge>
                        <StatusBadge tone={STATUS_TONE[r.displayStatus]}>
                          {RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Emissão {formatDate(r.issueDate)} · {r.installmentsCount}x
                        {r.sourceSnapshot?.professionalName ? ` · ${r.sourceSnapshot.professionalName}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">{brl(r.finalAmount)}</p>
                      <p className="text-xs text-muted-foreground">
                        recebido {brl(r.paidAmount)} · saldo {brl(r.balance)}
                      </p>
                    </div>
                  </div>

                  {baixas.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                      {baixas.map((p: any) => (
                        <li key={p.id}>
                          Pagamento {brl(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] || p.method} · {formatDate(p.paidAt)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
