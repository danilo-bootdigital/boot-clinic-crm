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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** prefixos adicionais que ativam o item */
  match?: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Pacientes", href: "/pacientes", icon: Users, match: ["/patients"] },
      { label: "CRM", href: "/crm", icon: Target },
      { label: "Agenda", href: "/agenda", icon: CalendarDays },
      { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
      { label: "Follow-up", href: "/followup", icon: Repeat },
      { label: "Automações", href: "/automacoes", icon: Workflow },
    ],
  },
  {
    title: "Análise",
    items: [
      { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
      { label: "Configurações", href: "/configuracoes", icon: Settings },
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
  crm: "CRM",
  automacoes: "Automações",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  audit: "Auditoria",
};

export function isActive(pathname: string, item: NavItem): boolean {
  const candidates = [item.href, ...(item.match ?? [])];
  return candidates.some(
    (base) => pathname === base || pathname.startsWith(base + "/"),
  );
}
