import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "muted";

const toneStyles: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  /** variação percentual; positivo = verde, negativo = vermelho */
  trend?: { value: number; label?: string };
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  trend,
  className,
}: StatCardProps) {
  const up = trend ? trend.value >= 0 : false;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && (
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              toneStyles[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-xs font-medium",
              up ? "text-success" : "text-destructive",
            )}
          >
            {up ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      {(hint || trend?.label) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {trend?.label ?? hint}
        </p>
      )}
    </div>
  );
}
