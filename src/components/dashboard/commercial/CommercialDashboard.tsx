'use client'

import { UserPlus, DollarSign, FileText, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { useKpis, brl } from '@/components/dashboard/use-kpis'

const ORIGIN_LABELS: Record<string, string> = {
  GOOGLE: 'Google', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', REFERRAL: 'Indicação',
  WALK_IN: 'Passagem', PHONE: 'Telefone', WHATSAPP: 'WhatsApp', OTHER: 'Outros',
}

export default function CommercialDashboard() {
  const { kpis, loading } = useKpis()
  if (loading) return (
    <div className="space-y-6"><PageHeader title="Comercial" description="Métricas e análise comercial" /><LoadingState rows={4} /></div>
  )
  const p = kpis?.patients ?? {}
  const d = kpis?.deals ?? {}
  const won = d.wonThisMonth ?? 0
  const lost = d.lostThisMonth ?? 0
  const conversion = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0

  const origins = Object.entries(p.byOrigin ?? {}) as [string, number][]
  const totalOrigin = origins.reduce((s, [, n]) => s + n, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Comercial" description="Métricas e análise comercial" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Novos Pacientes" value={String(p.newThisMonth ?? 0)} hint="Este mês" tone="primary" icon={<UserPlus className="h-[18px] w-[18px]" />} />
        <StatCard label="Receita ganha" value={brl(d.wonValueThisMonth)} hint="Este mês" tone="success" icon={<DollarSign className="h-[18px] w-[18px]" />} />
        <StatCard label="Propostas" value={String(d.open ?? 0)} hint="Em aberto" tone="warning" icon={<FileText className="h-[18px] w-[18px]" />} />
        <StatCard label="Taxa de Conversão" value={`${conversion}%`} hint="Ganhas / decididas (mês)" tone="primary" icon={<TrendingUp className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fontes de Aquisição" description="Origem dos pacientes">
          {totalOrigin === 0 ? (
            <EmptyState title="Sem pacientes ainda" description="As fontes aparecerão conforme pacientes forem cadastrados." />
          ) : (
            <div className="space-y-3">
              {origins.sort((a, b) => b[1] - a[1]).map(([origin, n]) => {
                const pct = Math.round((n / totalOrigin) * 100)
                return (
                  <div key={origin}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="text-foreground">{ORIGIN_LABELS[origin] || origin}</span>
                      <span className="font-medium text-muted-foreground">{pct}% ({n})</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Pipeline" description="Resumo das oportunidades">
          <div className="divide-y divide-border">
            {[
              ['Em aberto', d.open ?? 0],
              ['Valor em aberto', brl(d.openValue)],
              ['Ganhas (mês)', won],
              ['Perdidas (mês)', lost],
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
