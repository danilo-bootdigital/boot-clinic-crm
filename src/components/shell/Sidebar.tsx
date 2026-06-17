"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, isActive } from "./nav-config";

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

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        setPerms(me?.permissions ?? null);
        setRole(me?.role ?? null);
      })
      .catch(() => {
        setPerms(null);
        setRole(null);
      });
  }, []);

  // Oculta itens cujo módulo o usuário não pode ao menos visualizar.
  // Enquanto carrega (perms === null), mostra tudo para evitar "piscar".
  // Itens superAdmin só aparecem para SUPER_ADMIN (nunca enquanto carrega).
  const canSee = (item: { module?: string; superAdmin?: boolean }) => {
    if (item.superAdmin) return role === "SUPER_ADMIN";
    return !item.module || perms === null || perms[item.module] !== "none";
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
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out",
          collapsed ? "w-[72px]" : "w-64",
          // mobile drawer
          "max-lg:w-64",
          mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                Boot Clinic
              </p>
              <p className="truncate text-[11px] text-sidebar-muted">CRM Médico</p>
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
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-sidebar-foreground hover:bg-white/5 hover:text-white",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            !active && "text-sidebar-muted group-hover:text-white",
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
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-white/5 hover:text-white"
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
