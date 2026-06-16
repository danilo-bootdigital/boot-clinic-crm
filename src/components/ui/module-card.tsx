import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  href: string;
  /** rótulo de métrica opcional (ex.: "128 pacientes") */
  meta?: string;
  className?: string;
}

export function ModuleCard({
  title,
  description,
  icon,
  href,
  meta,
  className,
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          {icon}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 flex-1 text-sm text-muted-foreground">{description}</p>
      )}
      {meta && (
        <p className="mt-3 text-xs font-medium text-muted-foreground">{meta}</p>
      )}
    </Link>
  );
}
