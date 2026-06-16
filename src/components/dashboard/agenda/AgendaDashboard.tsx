import { CalendarClock, CalendarRange, CalendarDays, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

export default function AgendaDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Agenda" description="Gerencie sua agenda médica e consultas" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hoje" value="0" hint="Consultas" tone="primary" icon={<CalendarClock className="h-[18px] w-[18px]" />} />
        <StatCard label="Esta Semana" value="0" hint="Consultas" tone="primary" icon={<CalendarRange className="h-[18px] w-[18px]" />} />
        <StatCard label="Este Mês" value="0" hint="Consultas" tone="primary" icon={<CalendarDays className="h-[18px] w-[18px]" />} />
        <StatCard label="Comparecimento" value="0%" hint="Últimos 7 dias" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Próximas Consultas" description="Lista de consultas agendadas para os próximos dias">
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Nenhuma consulta agendada"
          description="As próximas consultas aparecerão aqui assim que forem agendadas."
        />
      </SectionCard>
    </div>
  );
}
