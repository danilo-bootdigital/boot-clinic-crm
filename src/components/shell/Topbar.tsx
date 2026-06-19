"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Search,
  Bell,
  Plus,
  LogOut,
  User as UserIcon,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Breadcrumbs } from "./Breadcrumbs";

interface TopbarProps {
  onOpenMobileNav: () => void;
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (email ?? "U").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:px-6">
      {/* Mobile menu */}
      <button
        onClick={onOpenMobileNav}
        className="-ml-1 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Breadcrumbs */}
      <div className="hidden min-w-0 sm:block">
        <Breadcrumbs />
      </div>

      {/* Busca global */}
      <div className="ml-auto flex max-w-md flex-1 items-center lg:ml-6 lg:mr-auto">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar pacientes, agendamentos…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* Ações rápidas */}
      <button className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex">
        <Plus className="h-4 w-4" />
        <span>Novo</span>
      </button>

      {/* Notificações */}
      <button
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Notificações"
      >
        <Bell className="h-[18px] w-[18px]" />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
      </button>

      {/* Usuário */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-muted"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initials}
          </span>
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-foreground md:block">
            {email ?? "Usuário"}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 animate-fade-in overflow-hidden rounded-lg border border-border bg-popover shadow-popover">
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Conectado como</p>
              <p className="truncate text-sm font-medium text-foreground">
                {email ?? "Usuário"}
              </p>
            </div>
            <div className="p-1">
              <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                Meu perfil
              </button>
              <button
                onClick={handleLogout}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10",
                )}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
