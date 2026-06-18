import {
  LayoutDashboard,
  Users,
  Target,
  CalendarDays,
  MessageCircle,
  Repeat,
  Workflow,
  BarChart3,
  Settings,
  Building2,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** prefixos adicionais que ativam o item */
  match?: string[];
  /** módulo de permissão; se o usuário não tiver 'view', o item é ocultado */
  module?: string;
  /** item exclusivo do dono do SaaS; só aparece para SUPER_ADMIN */
  superAdmin?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
      { label: "Pacientes", href: "/pacientes", icon: Users, match: ["/patients"], module: "patients" },
      { label: "Clínico", href: "/clinico", icon: Stethoscope, module: "clinico" },
      { label: "CRM", href: "/crm", icon: Target, module: "crm" },
      { label: "Agenda", href: "/agenda", icon: CalendarDays, module: "agenda" },
      { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, module: "whatsapp" },
      { label: "Follow-up", href: "/followup", icon: Repeat, module: "followup" },
      { label: "Automações", href: "/automacoes", icon: Workflow, module: "automacoes" },
    ],
  },
  {
    title: "Análise",
    items: [
      { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
      { label: "Configurações", href: "/configuracoes", icon: Settings, module: "configuracoes" },
    ],
  },
  {
    title: "SaaS",
    items: [
      { label: "Clínicas", href: "/admin", icon: Building2, superAdmin: true },
    ],
  },
];

/** Mapa de rotas → rótulo legível para breadcrumbs. */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  executive: "Executivo",
  commercial: "Comercial",
  agenda: "Agenda",
  whatsapp: "WhatsApp",
  followup: "Follow-up",
  reception: "Recepção",
  pacientes: "Pacientes",
  patients: "Pacientes",
  clinico: "Clínico",
  anamneses: "Anamneses",
  prontuario: "Prontuário",
  contratos: "Contratos",
  orcamentos: "Orçamentos",
  imagens: "Imagens",
  crm: "CRM",
  automacoes: "Automações",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  audit: "Auditoria",
  admin: "Clínicas",
};

export function isActive(pathname: string, item: NavItem): boolean {
  const candidates = [item.href, ...(item.match ?? [])];
  return candidates.some(
    (base) => pathname === base || pathname.startsWith(base + "/"),
  );
}
