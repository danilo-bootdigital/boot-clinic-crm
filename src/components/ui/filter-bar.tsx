import * as React from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  /** geralmente um SearchInput */
  search?: React.ReactNode;
  /** selects / chips de filtro */
  filters?: React.ReactNode;
  /** ações à direita */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Barra de filtros padrão: busca à esquerda, filtros ao centro,
 * ações à direita. Encapsula o layout responsivo.
 */
export function FilterBar({ search, filters, actions, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {search}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Select estilizado para uso dentro da FilterBar. */
export const FilterSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
FilterSelect.displayName = "FilterSelect";
