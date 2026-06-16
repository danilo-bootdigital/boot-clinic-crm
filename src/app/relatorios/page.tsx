import Link from "next/link";
import { BarChart3, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/ui/action-button";

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Indicadores e exportações de desempenho da clínica"
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" />}
        title="Relatórios"
        description="Visualize os principais indicadores no painel executivo enquanto os relatórios exportáveis são disponibilizados."
        action={
          <Link href="/dashboard/executive">
            <ActionButton icon={<LayoutDashboard />} variant="outline">
              Ver painel executivo
            </ActionButton>
          </Link>
        }
      />
    </div>
  );
}
