'use client'

import Link from 'next/link'
import { CalendarClock, CheckCircle2, PhoneCall, UserX, CalendarPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { useKpis } from '@/components/dashboard/use-kpis'

const ACTIONS = [
  { title: 'Novo Agendamento', desc: 'Agendar consulta', icon: CalendarPlus, href: '/agenda' },
  { title: 'Ver Agenda', desc: 'Consultas do dia', icon: CalendarClock, href: '/agenda' },
  { title: 'Pacientes', desc: 'Gerenciar pacientes', icon: Users, href: '/pacientes' },
]

export default function ReceptionDashboard() {
  const { kpis, loading } = useKpis()
  if (loading) return (
    <div className="space-y-6"><PageHeader title="Recepção" description="Controle de agendamento e atendimento" /><LoadingState rows={4} /></div>
  )
  const a = kpis?.appointments ?? {}
  const t = a.todayByStatus ?? {}

  return (
    <div className="space-y-6">
      <PageHeader title="Recepção" description="Controle de agendamento e atendimento" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hoje" value={String(a.today ?? 0)} hint="Consultas" tone="primary" icon={<CalendarClock className="h-[18px] w-[18px]" />} />
        <StatCard label="Confirmadas" value={String(t.CONFIRMED ?? 0)} hint="Hoje" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
        <StatCard label="Pendentes" value={String(t.PENDING ?? 0)} hint="Hoje — confirmar" tone="warning" icon={<PhoneCall className="h-[18px] w-[18px]" />} />
        <StatCard label="Não Compareceram" value={String(a.noShow7d ?? 0)} hint="Últimos 7 dias" tone="destructive" icon={<UserX className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Ações Rápidas" description="Operações comuns da recepção">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((act) => {
            const Icon = act.icon
            return (
              <Link
                key={act.title}
                href={act.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{act.title}</span>
                  <span className="block text-xs text-muted-foreground">{act.desc}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
