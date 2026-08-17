"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** Rotas que NÃO usam o shell (sem sidebar/header). */
// '/tele' = sala pública da teleconsulta (paciente, sem login nem navegação do CRM).
const BARE_ROUTES = ["/login", "/tele"];

/**
 * Rotas full-bleed: mantêm sidebar e topbar, mas a página ocupa TODA a área
 * restante — sem `max-w-content`, sem padding e sem o scroll do `<main>`.
 *
 * É o que uma caixa de entrada precisa: a lista e a thread rolam cada uma no
 * seu painel, com o campo de envio fixo no rodapé. Numa página comum (que rola
 * inteira) o composer sumiria no fim do documento.
 */
const FULL_ROUTES = ["/mensageria"];

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

  const matches = (routes: string[]) =>
    routes.some((r) => pathname === r || pathname.startsWith(r + "/"));

  const bare = matches(BARE_ROUTES);
  const full = matches(FULL_ROUTES);

  if (bare) return <>{children}</>;

  return (
    <div className={cn("bg-background", full ? "h-viewport overflow-hidden" : "min-h-screen")}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "flex flex-col transition-[padding] duration-200 ease-in-out",
          full ? "h-viewport" : "min-h-screen",
          collapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        {full ? (
          // `min-h-0` é o que permite os painéis internos rolarem: sem isso o
          // flex item cresce com o conteúdo e o scroll volta para a janela.
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        ) : (
          <main className="scrollbar-thin flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-content animate-fade-in">
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
