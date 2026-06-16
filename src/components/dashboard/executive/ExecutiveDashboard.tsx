import { DollarSign, Users, Stethoscope, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";

const COMPARISONS = [
  { label: "Receita", value: "—" },
  { label: "Pacientes Novos", value: "—" },
  { label: "Consultas", value: "—" },
  { label: "Retenção", value: "—" },
];

const GOALS = [
  { label: "Receita", progress: 0 },
  { label: "Novos Pacientes", progress: 0 },
  { label: "Consultas", progress: 0 },
];

export default function ExecutiveDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Executivo"
        description="Visão geral do negócio e indicadores de desempenho"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita Total" value="R$ 0" hint="Este mês" tone="success" icon={<DollarSign className="h-[18px] w-[18px]" />} />
        <StatCard label="Pacientes Ativos" value="0" hint="Total" tone="primary" icon={<Users className="h-[18px] w-[18px]" />} />
        <StatCard label="Consultas Realizadas" value="0" hint="Este mês" tone="primary" icon={<Stethoscope className="h-[18px] w-[18px]" />} />
        <StatCard label="Satisfação Média" value="0/5" hint="Este mês" tone="warning" icon={<Star className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Mês vs Mês Anterior" description="Comparação de desempenho">
          <div className="divide-y divide-border">
            {COMPARISONS.map((c) => (
              <div key={c.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-foreground">{c.label}</span>
                <span className="text-sm font-medium text-muted-foreground">{c.value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Meta do Mês" description="Progresso em relação às metas">
          <div className="space-y-4">
            {GOALS.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-foreground">{g.label}</span>
                  <span className="font-medium text-muted-foreground">{g.progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${g.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
