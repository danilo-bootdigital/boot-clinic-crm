import Link from "next/link";
import { Plus, CalendarDays, CalendarClock, CalendarRange, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/ui/action-button";

export default function AgendaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda Médica"
        description="Controle completo de agendamentos e consultas"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <Link href="/agenda">
            <ActionButton icon={<Plus />}>Novo Agendamento</ActionButton>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hoje" value="0" hint="Consultas" tone="primary" icon={<CalendarClock className="h-[18px] w-[18px]" />} />
        <StatCard label="Esta Semana" value="0" hint="Consultas" tone="primary" icon={<CalendarRange className="h-[18px] w-[18px]" />} />
        <StatCard label="Este Mês" value="0" hint="Consultas" tone="primary" icon={<CalendarDays className="h-[18px] w-[18px]" />} />
        <StatCard label="Confirmadas" value="0" hint="No período" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Calendário" description="Visualize e gerencie os agendamentos da clínica">
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Nenhum agendamento para exibir"
          description="Os agendamentos da clínica aparecerão aqui assim que forem criados."
          action={
            <Link href="/agenda">
              <ActionButton icon={<Plus />}>Novo Agendamento</ActionButton>
            </Link>
          }
        />
      </SectionCard>
    </div>
  );
}
