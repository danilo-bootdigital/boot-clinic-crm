'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DollarSign, Users, Stethoscope, Target } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { AreaTrendChart } from '@/components/charts'

const brl = (n: number) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const brlAxis = (n: number) => (Math.abs(n) >= 1000 ? `R$ ${Math.round(n / 1000)}k` : `R$ ${Math.round(n)}`)
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MES[Number(mm) - 1]}/${y.slice(2)}` }
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0)

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev
  const tone = diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'
  return <span className={`text-xs ${tone}`}>{diff >= 0 ? '+' : ''}{diff} vs. mês anterior</span>
}

export default function ExecutiveDashboard() {
  const router = useRouter()
  const [kpis, setKpis] = useState<any | null>(null)
  const [trends, setTrends] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/dashboard/kpis', { cache: 'no-store' })
      if (res.status === 401) { router.push('/login?redirect=/dashboard/executive'); return }
      if (res.ok) setKpis(await res.json())
      const tr = await fetch('/api/dashboard/trends', { cache: 'no-store' })
      if (tr.ok) setTrends((await tr.json()).series ?? [])
      setLoading(false)
    })()
  }, [router])

  if (loading) return (
    <div className="space-y-6">
      <PageHeader title="Executivo" description="Visão geral do negócio e indicadores de desempenho" />
      <LoadingState rows={4} label="Carregando indicadores" />
    </div>
  )

  const p = kpis?.patients ?? {}
  const d = kpis?.deals ?? {}
  const a = kpis?.appointments ?? {}

  return (
    <div className="space-y-6">
      <PageHeader title="Executivo" description="Visão geral do negócio e indicadores de desempenho" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita ganha (mês)" value={brl(d.wonValueThisMonth)} hint={`${d.wonThisMonth ?? 0} oportunidade(s)`} tone="success" icon={<DollarSign className="h-[18px] w-[18px]" />} />
        <StatCard label="Pacientes ativos" value={String(p.active ?? 0)} hint={`${p.total ?? 0} no total`} tone="primary" icon={<Users className="h-[18px] w-[18px]" />} />
        <StatCard label="Consultas realizadas (mês)" value={String(a.attendedThisMonth ?? 0)} tone="primary" icon={<Stethoscope className="h-[18px] w-[18px]" />} trend={{ value: pct(a.attendedThisMonth ?? 0, a.attendedPrevMonth ?? 0), label: 'vs. mês anterior' }} />
        <StatCard label="Oportunidades abertas" value={String(d.open ?? 0)} hint={brl(d.openValue) + ' em aberto'} tone="warning" icon={<Target className="h-[18px] w-[18px]" />} />
      </div>

      {trends && trends.length > 0 && (
        <SectionCard title="Receita ganha — evolução" description="Últimos 6 meses">
          <AreaTrendChart
            data={trends.map((t) => ({ label: mesLabel(t.month), wonValue: t.wonValue }))}
            dataKey="wonValue"
            valueFormatter={brl}
            axisFormatter={brlAxis}
          />
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Mês vs mês anterior" description="Comparação de desempenho">
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2.5 first:pt-0">
              <span className="text-sm text-foreground">Pacientes novos</span>
              <span className="flex flex-col items-end">
                <span className="text-sm font-medium">{p.newThisMonth ?? 0}</span>
                <Delta cur={p.newThisMonth ?? 0} prev={p.newPrevMonth ?? 0} />
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5 last:pb-0">
              <span className="text-sm text-foreground">Consultas realizadas</span>
              <span className="flex flex-col items-end">
                <span className="text-sm font-medium">{a.attendedThisMonth ?? 0}</span>
                <Delta cur={a.attendedThisMonth ?? 0} prev={a.attendedPrevMonth ?? 0} />
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Pipeline (mês)" description="Resumo das oportunidades">
          <div className="divide-y divide-border">
            {[
              ['Abertas', d.open ?? 0],
              ['Ganhas', d.wonThisMonth ?? 0],
              ['Perdidas', d.lostThisMonth ?? 0],
              ['Valor em aberto', brl(d.openValue)],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-foreground">{label}</span>
                <span className="text-sm font-medium text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
