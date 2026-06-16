import { ListTodo, AlertTriangle, CalendarRange, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

const TEMPLATES = [
  { title: "Pós-Consulta", desc: "Envio 24 horas após a consulta" },
  { title: "Retorno", desc: "Lembrete de retorno em 30 dias" },
  { title: "Aniversário", desc: "Mensagem de aniversário anual" },
];

export default function FollowUpDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Follow-up" description="Gerenciar tarefas e acompanhamentos" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tarefas Pendentes" value="0" hint="Hoje" tone="primary" icon={<ListTodo className="h-[18px] w-[18px]" />} />
        <StatCard label="Follow-ups Atrasados" value="0" hint="Crítico" tone="destructive" icon={<AlertTriangle className="h-[18px] w-[18px]" />} />
        <StatCard label="Tarefas da Semana" value="0" hint="Próximos 7 dias" tone="primary" icon={<CalendarRange className="h-[18px] w-[18px]" />} />
        <StatCard label="Taxa de Conclusão" value="0%" hint="Este mês" tone="success" icon={<CheckCircle2 className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Tarefas Recentes" description="Últimas tarefas criadas">
          <EmptyState title="Nenhuma tarefa encontrada" description="As tarefas criadas aparecerão aqui." />
        </SectionCard>

        <SectionCard title="Pacientes com Follow-up" description="Pacientes que precisam de acompanhamento">
          <EmptyState title="Nenhum paciente encontrado" description="Pacientes que precisam de acompanhamento aparecerão aqui." />
        </SectionCard>
      </div>

      <SectionCard title="Modelos de Follow-up" description="Templates automatizados de acompanhamento">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div key={t.title} className="rounded-lg border border-border bg-background/50 p-4 transition-colors hover:border-primary/30">
              <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
