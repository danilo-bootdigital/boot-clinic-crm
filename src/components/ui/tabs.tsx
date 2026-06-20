import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  /** contador opcional exibido à direita do rótulo */
  count?: number;
}

/**
 * Classe única do "gatilho" de aba do Design System (borda inferior teal de
 * 2px no item ativo). Fonte de verdade compartilhada entre `<Tabs>` (estado
 * in-page) e `<TabsNav>` (navegação por rota) — antes era copiada à mão em
 * cada implementação.
 */
export function tabTriggerClass(active: boolean) {
  return cn(
    "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active
      ? "border-primary text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );
}

/** Badge de contador exibido à direita do rótulo de uma aba. */
function TabCount({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-xs font-semibold",
        active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * Abas do Design System com estado in-page (controlado via `value`).
 * Para abas que navegam entre rotas use `<TabsNav>`.
 */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-border", className)}
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(t.value)}
            className={tabTriggerClass(active)}
          >
            {t.label}
            {typeof t.count === "number" && <TabCount active={active} count={t.count} />}
          </button>
        );
      })}
    </div>
  );
}

export interface TabNavItem {
  href: string;
  label: React.ReactNode;
  /** aba ativa — calculada pelo pai a partir do pathname/rota */
  active: boolean;
  count?: number;
}

interface TabsNavProps {
  items: TabNavItem[];
  /** habilita rolagem horizontal (rótulos não quebram) */
  scrollable?: boolean;
  className?: string;
}

/**
 * Abas que navegam entre rotas (renderizadas como `<Link>`). Mesma aparência
 * do DS que `<Tabs>` — a detecção do item ativo fica no componente pai (a
 * lógica de rota varia por módulo), e o estilo vem de `tabTriggerClass`.
 */
export function TabsNav({ items, scrollable, className }: TabsNavProps) {
  return (
    <nav
      role="tablist"
      className={cn(
        "flex gap-1 border-b border-border",
        scrollable && "scrollbar-thin overflow-x-auto",
        className,
      )}
    >
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className={tabTriggerClass(t.active)}
        >
          {t.label}
          {typeof t.count === "number" && <TabCount active={t.active} count={t.count} />}
        </Link>
      ))}
    </nav>
  );
}
