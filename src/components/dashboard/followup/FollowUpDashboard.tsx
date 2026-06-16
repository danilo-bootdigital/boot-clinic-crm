'use client'

import Link from 'next/link'
import { ListTodo, AlertTriangle, CalendarRange, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import { LoadingState } from '@/components/ui/loading-state'
import { useKpis } from '@/components/dashboard/use-kpis'

export default function FollowUpDashboard() {
  const { kpis, loading } = useKpis()
  if (loading) return (
    <div className="space-y-6"><PageHeader title="Follow-up" description="Gerenciar tarefas e acompanhamentos" /><LoadingState rows={4} /></div>
  )
  const f = kpis?.followup ?? {}

  return (
    <div className="space-y-6">
      <PageHeader title="Follow-up" description="Gerenciar tarefas e acompanhamentos" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tarefas Pendentes" value={String(f.pendingToday ?? 0)} hint="Vencem hoje" tone="primary" icon={<ListTodo className="h-[18px] w-[18px]" />} />
        <StatCard label="Atrasadas" value={String(f.overdue ?? 0)} hint="Crítico" tone="destructive" icon={<AlertTriangle className="h-[18px] w-[18px]" />} />
        <StatCard label="Da Semana" value={String(f.thisWeek ?? 0)} hint="Próximos 7 dias" tone="primary" icon={<CalendarRange className="h-[18px] w-[18px]" />} />
        <StatCard label="Taxa de Conclusão" value={`${f.completionRate ?? 0}%`} hint="Este mês" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Tarefas de Follow-up" description="Gerencie os acompanhamentos da clínica">
        <EmptyState
          icon={<ListTodo className="h-6 w-6" />}
          title={`${f.completedThisMonth ?? 0} concluída(s) de ${f.totalThisMonth ?? 0} no mês`}
          description="Abra o módulo de Follow-up para criar, concluir e acompanhar tarefas."
          action={<Link href="/followup"><ActionButton>Abrir Follow-up</ActionButton></Link>}
        />
      </SectionCard>
    </div>
  )
}
