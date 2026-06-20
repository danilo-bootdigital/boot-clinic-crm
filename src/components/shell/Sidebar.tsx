"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, isActive } from "./nav-config";

type Company = { name: string | null; logo: string | null };

// Iniciais da clínica para o fallback do avatar (máx. 2 letras).
function initials(name: string | null | undefined): string {
  if (!name) return "MC";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** controle do drawer mobile */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [perms, setPerms] = useState<Record<string, string> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  // Módulos habilitados na clínica (plano contratado + ativação). null = carregando.
  const [modules, setModules] = useState<string[] | null>(null);
  // Identidade visual da clínica logada (logo + nome).
  const [company, setCompany] = useState<Company | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        setPerms(me?.permissions ?? null);
        setRole(me?.role ?? null);
        setModules(Array.isArray(me?.modules) ? me.modules : null);
        setCompany(me?.company ?? null);
      })
      .catch(() => {
        setPerms(null);
        setRole(null);
        setModules(null);
        setCompany(null);
      });
  }, []);

  // Oculta um item se: (a) o módulo não está habilitado na clínica (plano/ativação),
  // ou (b) o usuário não pode ao menos visualizar (RBAC). Enquanto carrega, mostra
  // tudo para evitar "piscar". Itens superAdmin só aparecem para SUPER_ADMIN.
  const canSee = (item: { module?: string; superAdmin?: boolean }) => {
    if (item.superAdmin) return role === "SUPER_ADMIN";
    if (!item.module) return true;
    const moduleEnabled = modules === null || modules.includes(item.module);
    const hasPerm = perms === null || perms[item.module] !== "none";
    return moduleEnabled && hasPerm;
  };

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out",
          collapsed ? "w-[72px]" : "w-64",
          // mobile drawer
          "max-lg:w-64",
          mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        {/* Identidade da clínica logada */}
        <div className={cn("flex h-[72px] items-center gap-3", collapsed ? "justify-center px-2" : "px-4")}>
          {company?.logo && !logoBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo}
              alt={company.name || "Logo da clínica"}
              onError={() => setLogoBroken(true)}
              className="h-12 w-12 shrink-0 rounded-lg border border-border bg-card object-contain p-1"
            />
          ) : company ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
              {initials(company.name)}
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-6 w-6" strokeWidth={2.5} />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {company?.name || "Minha Clínica"}
              </p>
              <p className="truncate text-[11px] text-sidebar-muted">Boot Clinic CRM</p>
            </div>
          )}
        </div>

        {/* Navegação */}
        <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          {NAV_SECTIONS.map((section, i) => {
            const visibleItems = section.items.filter(canSee);
            // Não renderiza a seção (nem seu título) se nada nela é visível.
            if (visibleItems.length === 0) return null;
            return (
            <div key={i} className={cn(i > 0 && "mt-6")}>
              {section.title && !collapsed && (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {visibleItems.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-accent font-semibold text-accent-foreground"
                            : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            !active && "text-sidebar-muted group-hover:text-foreground",
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </nav>

        {/* Recolher (desktop) */}
        <div className="hidden border-t border-sidebar-border p-3 lg:block">
          <button
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-transform",
                collapsed && "rotate-180",
              )}
            />
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
