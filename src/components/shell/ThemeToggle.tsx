"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bcc.theme";

/**
 * Roda no <head>, antes da primeira pintura: aplica o tema salvo para a página
 * não piscar em branco ao recarregar no escuro. Padrão é o claro — o escuro só
 * vale depois que a pessoa escolhe. try/catch porque o storage pode estar
 * bloqueado (aba anônima, política do navegador).
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${STORAGE_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export function ThemeToggle({ className }: { className?: string }) {
  // null até montar: o servidor não sabe o tema, e o ícone errado piscaria.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  const label = dark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {dark === null ? (
        <span className="h-[18px] w-[18px]" />
      ) : dark ? (
        <Sun className="h-[18px] w-[18px]" />
      ) : (
        <Moon className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
