'use client'

import { useEffect, useState } from 'react'
import { Gauge, TrendingUp, TrendingDown, AlertTriangle, CircleDollarSign, Receipt, Scale, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { brl } from '@/lib/financial-format'

interface Dash {
  receitaBruta: number; descontos: number; receitaLiquida: number
  recebido: number; emAberto: number; inadimplencia: number; inadimplenciaPct: number
  ticketMedio: number; despesas: number; pago: number
  resultadoOperacional: number; resultadoCaixa: number; qtdRecebiveis: number
}

export default function DashboardFinanceiroPage() {
  const [role, setRole] = useState('')
  const [d, setD] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch('/api/financeiro/dashboard').then((r) => (r.status === 403 ? { _denied: true } : r.json())),
    ]).then(([me, dash]) => {
      setRole(me?.role || '')
      if (dash?._denied || dash?.error) { setDenied(true); return }
      setD(dash)
    }).finally(() => setLoading(false))
  }, [])

  if (denied) return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Dashboard" icon={<Gauge className="h-5 w-5" />} />
      <FinanceTabs role={role} />
      <EmptyState title="Sem acesso" description="O dashboard financeiro é restrito a OWNER, MANAGER e Financeiro." />
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Dashboard executivo" icon={<Gauge className="h-5 w-5" />} />
      <FinanceTabs role={role} />

      {loading || !d ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Receita</h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Receita bruta" value={brl(d.receitaBruta)} icon={<CircleDollarSign className="h-4 w-4" />} tone="primary" hint={`${d.qtdRecebiveis} recebíveis`} />
            <StatCard label="Receita líquida" value={brl(d.receitaLiquida)} icon={<Receipt className="h-4 w-4" />} tone="primary" hint={`descontos ${brl(d.descontos)}`} />
            <StatCard label="Recebido" value={brl(d.recebido)} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
            <StatCard label="Ticket médio" value={brl(d.ticketMedio)} icon={<Scale className="h-4 w-4" />} tone="muted" />
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Aberto & inadimplência</h2>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Em aberto" value={brl(d.emAberto)} icon={<Wallet className="h-4 w-4" />} tone="warning" />
            <StatCard label="Inadimplência" value={brl(d.inadimplencia)} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="parcelas vencidas em aberto" />
            <StatCard label="% Inadimplência" value={`${d.inadimplenciaPct.toFixed(1)}%`} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="sobre a receita líquida" />
          </div>

          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Despesas & resultado</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Despesas (competência)" value={brl(d.despesas)} icon={<TrendingDown className="h-4 w-4" />} tone="warning" />
            <StatCard label="Pago" value={brl(d.pago)} icon={<TrendingDown className="h-4 w-4" />} tone="muted" />
            <StatCard label="Resultado operacional" value={brl(d.resultadoOperacional)} icon={<Scale className="h-4 w-4" />} tone={d.resultadoOperacional >= 0 ? 'success' : 'destructive'} hint="receita líquida − despesas" />
            <StatCard label="Resultado de caixa" value={brl(d.resultadoCaixa)} icon={<Wallet className="h-4 w-4" />} tone={d.resultadoCaixa >= 0 ? 'success' : 'destructive'} hint="recebido − pago" />
          </div>
        </>
      )}
    </div>
  )
}
