"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** Rotas que NÃO usam o shell (sem sidebar/header). */
// '/tele' = sala pública da teleconsulta (paciente, sem login nem navegação do CRM).
const BARE_ROUTES = ["/login", "/tele"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persistir preferência de recolhimento
  useEffect(() => {
    const saved = localStorage.getItem("bcc.sidebarCollapsed");
    if (saved) setCollapsed(saved === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("bcc.sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  }

  const bare = BARE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200 ease-in-out",
          collapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="scrollbar-thin flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-content animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
