"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Executivo", href: "/dashboard/executive" },
  { label: "Comercial", href: "/dashboard/commercial" },
  { label: "Agenda", href: "/dashboard/agenda" },
  { label: "WhatsApp", href: "/dashboard/whatsapp" },
  { label: "Follow-up", href: "/dashboard/followup" },
  { label: "Recepção", href: "/dashboard/reception" },
];

export function DashboardTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 border-b border-border">
      <nav className="scrollbar-thin -mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
