import { UserPlus, DollarSign, FileText, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

const SOURCES = ["Indicação", "Google", "Redes Sociais", "Outros"];

export default function CommercialDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Comercial" description="Métricas e análise comercial" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Novos Pacientes" value="0" hint="Este mês" tone="primary" icon={<UserPlus className="h-[18px] w-[18px]" />} />
        <StatCard label="Receita" value="R$ 0" hint="Este mês" tone="success" icon={<DollarSign className="h-[18px] w-[18px]" />} />
        <StatCard label="Propostas" value="0" hint="Em aberto" tone="warning" icon={<FileText className="h-[18px] w-[18px]" />} />
        <StatCard label="Taxa de Conversão" value="0%" hint="Proposta → paciente" tone="primary" icon={<TrendingUp className="h-[18px] w-[18px]" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Fontes de Aquisição" description="Onde os pacientes estão vindo">
          <div className="space-y-3">
            {SOURCES.map((s) => (
              <div key={s}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-foreground">{s}</span>
                  <span className="font-medium text-muted-foreground">0%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top Pacientes" description="Pacientes com maior valor">
          <EmptyState title="Sem dados ainda" description="Os pacientes de maior valor aparecerão aqui conforme os dados forem registrados." />
        </SectionCard>
      </div>
    </div>
  );
}
