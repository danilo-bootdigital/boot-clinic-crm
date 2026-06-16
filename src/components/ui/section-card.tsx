import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** remove o padding interno do corpo (ex.: tabelas full-bleed) */
  flush?: boolean;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: SectionCardProps) {
  const hasHeader = title || description || actions;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-card",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-5")}>{children}</div>
    </div>
  );
}
