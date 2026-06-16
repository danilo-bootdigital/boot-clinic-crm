'use client'

import Link from 'next/link'
import { CalendarClock, CalendarRange, CalendarDays, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import { LoadingState } from '@/components/ui/loading-state'
import { useKpis } from '@/components/dashboard/use-kpis'

export default function AgendaDashboard() {
  const { kpis, loading } = useKpis()
  if (loading) return (
    <div className="space-y-6"><PageHeader title="Agenda" description="Gerencie sua agenda médica e consultas" /><LoadingState rows={4} /></div>
  )
  const a = kpis?.appointments ?? {}
  const s = a.byStatus ?? {}
  const attended = s.ATTENDED ?? 0
  const noShow = s.NO_SHOW ?? 0
  const rate = attended + noShow > 0 ? Math.round((attended / (attended + noShow)) * 100) : 0

  return (
    <div className="space-y-6">
      <PageHeader title="Agenda" description="Gerencie sua agenda médica e consultas" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hoje" value={String(a.today ?? 0)} hint="Consultas" tone="primary" icon={<CalendarClock className="h-[18px] w-[18px]" />} />
        <StatCard label="Esta Semana" value={String(a.thisWeek ?? 0)} hint="Consultas" tone="primary" icon={<CalendarRange className="h-[18px] w-[18px]" />} />
        <StatCard label="Este Mês" value={String(a.thisMonth ?? 0)} hint="Consultas" tone="primary" icon={<CalendarDays className="h-[18px] w-[18px]" />} />
        <StatCard label="Comparecimento" value={`${rate}%`} hint="Este mês" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Agenda do dia" description="Acesse a agenda completa para ver e gerenciar as consultas">
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title={`${a.today ?? 0} consulta(s) para hoje`}
          description="Abra a agenda para visualizar a grade, criar e gerenciar os agendamentos."
          action={<Link href="/agenda"><ActionButton>Abrir Agenda</ActionButton></Link>}
        />
      </SectionCard>
    </div>
  )
}
