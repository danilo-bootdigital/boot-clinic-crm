import Link from "next/link";
import { Repeat, LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/ui/action-button";

export default function FollowUpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-up"
        description="Acompanhamento e tarefas de relacionamento com pacientes"
        icon={<Repeat className="h-5 w-5" />}
      />
      <EmptyState
        icon={<Repeat className="h-6 w-6" />}
        title="Follow-up de pacientes"
        description="Consulte os indicadores de acompanhamento no painel dedicado enquanto a gestão completa de tarefas é integrada."
        action={
          <Link href="/dashboard/followup">
            <ActionButton icon={<LayoutDashboard />} variant="outline">
              Ver painel de Follow-up
            </ActionButton>
          </Link>
        }
      />
    </div>
  );
}
