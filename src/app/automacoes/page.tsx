import { Workflow, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function AutomacoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações"
        description="Fluxos automáticos de mensagens, lembretes e tarefas"
        icon={<Workflow className="h-5 w-5" />}
      />
      <EmptyState
        icon={<Zap className="h-6 w-6" />}
        title="Automações"
        description="Configure gatilhos e ações automáticas para a rotina da clínica. O construtor de fluxos será disponibilizado nesta área."
      />
    </div>
  );
}
