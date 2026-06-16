import { Send, Inbox, AlertCircle, Timer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

const TEMPLATES = [
  { title: "Confirmação de Consulta", desc: "Lembrar sobre agendamento" },
  { title: "Pós-Consulta", desc: "Feedback sobre atendimento" },
  { title: "Retorno", desc: "Agendar nova consulta" },
];

const STATS = [
  { label: "Taxa de Resposta", value: "0%" },
  { label: "Satisfação", value: "0/5" },
  { label: "Atendimentos Finalizados", value: "0" },
];

export default function WhatsAppDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp" description="Gestão de comunicação via WhatsApp" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mensagens Enviadas" value="0" hint="Hoje" tone="success" icon={<Send className="h-[18px] w-[18px]" />} />
        <StatCard label="Mensagens Recebidas" value="0" hint="Hoje" tone="primary" icon={<Inbox className="h-[18px] w-[18px]" />} />
        <StatCard label="Atendimentos Pendentes" value="0" hint="Não lidas" tone="warning" icon={<AlertCircle className="h-[18px] w-[18px]" />} />
        <StatCard label="Tempo Médio de Resposta" value="0min" hint="Últimas 24h" tone="muted" icon={<Timer className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Conversas Recentes" description="Últimas interações">
          <EmptyState title="Nenhuma conversa recente" description="As conversas aparecerão aqui quando houver atividade." />
        </SectionCard>

        <SectionCard title="Estatísticas da Semana" description="Desempenho de comunicação">
          <div className="divide-y divide-border">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-foreground">{s.label}</span>
                <span className="text-sm font-medium text-muted-foreground">{s.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Modelos de Mensagem" description="Templates para comunicação rápida">
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
