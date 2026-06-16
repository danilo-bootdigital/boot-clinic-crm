import { CalendarClock, CheckCircle2, PhoneCall, UserX, CalendarPlus, LogIn, Phone, CalendarX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

const ACTIONS = [
  { title: "Nova Consulta", desc: "Agendar", icon: CalendarPlus },
  { title: "Check-in", desc: "Registrar chegada", icon: LogIn },
  { title: "Confirmar", desc: "Ligar paciente", icon: Phone },
  { title: "Cancelar", desc: "Desmarcar", icon: CalendarX },
];

export default function ReceptionDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Recepção" description="Controle de agendamento e atendimento" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hoje" value="0" hint="Consultas" tone="primary" icon={<CalendarClock className="h-[18px] w-[18px]" />} />
        <StatCard label="Confirmadas" value="0" hint="Hoje" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
        <StatCard label="Pendentes" value="0" hint="Ligar" tone="warning" icon={<PhoneCall className="h-[18px] w-[18px]" />} />
        <StatCard label="Não Compareceram" value="0" hint="Últimos 7 dias" tone="destructive" icon={<UserX className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Próximos Horários" description="Consultas do dia">
          <EmptyState title="Nenhuma consulta agendada para hoje" />
        </SectionCard>

        <SectionCard title="Pacientes do Dia" description="Lista de pacientes esperando">
          <EmptyState title="Nenhum paciente na lista de espera" />
        </SectionCard>
      </div>

      <SectionCard title="Ações Rápidas" description="Operações comuns da recepção">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.title}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-4 text-left transition-colors hover:border-primary/30 hover:bg-accent"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-foreground">{a.title}</span>
                  <span className="block text-xs text-muted-foreground">{a.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
