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
  Video,
  Wallet,
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
      { label: "Telemedicina", href: "/telemedicina", icon: Video, module: "telemedicina" },
      { label: "CRM", href: "/crm", icon: Target, module: "crm" },
      { label: "Agenda", href: "/agenda", icon: CalendarDays, module: "agenda" },
      { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, module: "whatsapp" },
      { label: "Follow-up", href: "/followup", icon: Repeat, module: "followup" },
      { label: "Automações", href: "/automacoes", icon: Workflow, module: "automacoes" },
      { label: "Financeiro", href: "/financeiro", icon: Wallet, module: "financeiro" },
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
  telemedicina: "Telemedicina",
  sala: "Sala",
  tele: "Teleconsulta",
  anamneses: "Anamneses",
  prontuario: "Prontuário",
  contratos: "Contratos",
  orcamentos: "Orçamentos",
  imagens: "Imagens",
  crm: "CRM",
  automacoes: "Automações",
  relatorios: "Relatórios",
  financeiro: "Financeiro",
  pagar: "Contas a Pagar",
  categorias: "Categorias",
  "centros-custo": "Centros de custo",
  "fluxo-caixa": "Fluxo de caixa",
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
