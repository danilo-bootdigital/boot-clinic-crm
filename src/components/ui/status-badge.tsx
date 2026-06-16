import * as React from "react";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "destructive" | "info" | "neutral";

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-[hsl(32_85%_38%)] ring-warning/30",
  destructive: "bg-destructive/10 text-destructive ring-destructive/20",
  info: "bg-primary/10 text-primary ring-primary/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: StatusTone;
  /** mostra o ponto colorido à esquerda */
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  tone = "neutral",
  dot = true,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneStyles[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "success" && "bg-success",
            tone === "warning" && "bg-warning",
            tone === "destructive" && "bg-destructive",
            tone === "info" && "bg-primary",
            tone === "neutral" && "bg-muted-foreground",
          )}
        />
      )}
      {children}
    </span>
  );
}
