'use client'

import { useEffect, useState } from 'react'
import { LineChart, TrendingUp, TrendingDown, Wallet, CalendarClock } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { payableCan } from '@/lib/financial-caps'
import { brl } from '@/lib/financial-format'

interface Row { mes: string; entradasReal: number; saidasReal: number; saldoReal: number; entradasPrev: number; saidasPrev: number }
interface CashFlow {
  saldoAtual: number; entradasRealizadas: number; saidasRealizadas: number
  entradasFuturas: number; saidasFuturas: number; resultadoProjetado: number; saldoPrevisto: number
  series: Row[]
}

const mesLabel = (m: string) => {
  const [y, mm] = m.split('-')
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm) - 1]}/${y.slice(2)}`
}

export default function FluxoCaixaPage() {
  const [role, setRole] = useState('')
  const [data, setData] = useState<CashFlow | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch('/api/financeiro/cashflow').then((r) => (r.status === 403 ? { _denied: true } : r.json())),
    ]).then(([me, cf]) => {
      setRole(me?.role || '')
      if (cf?._denied || cf?.error) { setDenied(true); return }
      setData(cf)
    }).finally(() => setLoading(false))
  }, [])

  if (denied) return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Fluxo de caixa" icon={<LineChart className="h-5 w-5" />} />
      <FinanceTabs role={role} />
      <EmptyState title="Sem acesso" description="O fluxo de caixa consolidado é restrito a OWNER, MANAGER e Financeiro." />
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Fluxo de caixa" icon={<LineChart className="h-5 w-5" />} />
      <FinanceTabs role={role} />

      {loading || !data ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Saldo atual (realizado)" value={brl(data.saldoAtual)} icon={<Wallet className="h-4 w-4" />} tone={data.saldoAtual >= 0 ? 'success' : 'destructive'} hint="entradas − saídas pagas" />
            <StatCard label="Saldo previsto" value={brl(data.saldoPrevisto)} icon={<CalendarClock className="h-4 w-4" />} tone={data.saldoPrevisto >= 0 ? 'primary' : 'destructive'} hint="atual + projeção em aberto" />
            <StatCard label="Entradas futuras" value={brl(data.entradasFuturas)} icon={<TrendingUp className="h-4 w-4" />} tone="success" hint="a receber em aberto" />
            <StatCard label="Saídas futuras" value={brl(data.saidasFuturas)} icon={<TrendingDown className="h-4 w-4" />} tone="warning" hint="a pagar em aberto" />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Recebido (realizado)" value={brl(data.entradasRealizadas)} tone="success" />
            <StatCard label="Pago (realizado)" value={brl(data.saidasRealizadas)} tone="muted" />
            <StatCard label="Resultado projetado" value={brl(data.resultadoProjetado)} tone={data.resultadoProjetado >= 0 ? 'primary' : 'destructive'} hint="entradas − saídas futuras" />
          </div>

          {data.series.length === 0 ? (
            <EmptyState title="Sem movimentação" description="Ainda não há entradas ou saídas para projetar." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Mês</th>
                    <th className="px-4 py-3 font-medium text-right">Entradas (real.)</th>
                    <th className="px-4 py-3 font-medium text-right">Saídas (real.)</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo (real.)</th>
                    <th className="px-4 py-3 font-medium text-right">Entradas (prev.)</th>
                    <th className="px-4 py-3 font-medium text-right">Saídas (prev.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.series.map((r) => (
                    <tr key={r.mes} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{mesLabel(r.mes)}</td>
                      <td className="px-4 py-3 text-right text-success">{r.entradasReal ? brl(r.entradasReal) : '—'}</td>
                      <td className="px-4 py-3 text-right">{r.saidasReal ? brl(r.saidasReal) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${r.saldoReal < 0 ? 'text-destructive' : ''}`}>{r.entradasReal || r.saidasReal ? brl(r.saldoReal) : '—'}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.entradasPrev ? brl(r.entradasPrev) : '—'}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.saidasPrev ? brl(r.saidasPrev) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
