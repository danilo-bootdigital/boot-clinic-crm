import Link from "next/link";
import { Plus, Target, Briefcase, Trophy, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/ui/action-button";

export default function CRMPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM — Pipeline de Vendas"
        description="Gestão de oportunidades e negócios da clínica"
        icon={<Target className="h-5 w-5" />}
        actions={
          <Link href="/crm">
            <ActionButton icon={<Plus />}>Nova Oportunidade</ActionButton>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Em Negociação" value="0" hint="Oportunidades abertas" tone="primary" icon={<Briefcase className="h-[18px] w-[18px]" />} />
        <StatCard label="Ganhas" value="0" hint="No período" tone="success" icon={<Trophy className="h-[18px] w-[18px]" />} />
        <StatCard label="Perdidas" value="0" hint="No período" tone="destructive" icon={<XCircle className="h-[18px] w-[18px]" />} />
      </div>

      <SectionCard title="Pipeline" description="Acompanhe as oportunidades por etapa do funil">
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="Nenhuma oportunidade cadastrada"
          description="Crie a primeira oportunidade para começar a acompanhar seu pipeline de vendas."
          action={
            <Link href="/crm">
              <ActionButton icon={<Plus />}>Nova Oportunidade</ActionButton>
            </Link>
          }
        />
      </SectionCard>
    </div>
  );
}
