import { Settings, Building2, Users, Bell } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

const GROUPS = [
  { title: "Clínica", desc: "Dados da empresa, unidades e horários de atendimento.", icon: Building2 },
  { title: "Usuários e Permissões", desc: "Equipe, papéis e níveis de acesso (RBAC).", icon: Users },
  { title: "Notificações", desc: "Preferências de alertas e lembretes.", icon: Bell },
];

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Preferências gerais do sistema e da clínica"
        icon={<Settings className="h-5 w-5" />}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <SectionCard key={g.title}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{g.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{g.desc}</p>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
