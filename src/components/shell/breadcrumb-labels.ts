"use client";

import { useEffect, useSyncExternalStore } from "react";

// Rótulos dinâmicos do breadcrumb: a página de detalhe sabe o nome do registro
// (paciente, contrato…), o breadcrumb só conhece o id da URL. A página publica
// aqui "id → nome" e o breadcrumb mostra o nome no lugar do código.
const labels = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lê o rótulo publicado para um segmento da URL (re-renderiza quando muda). */
export function useBreadcrumbLabels() {
  useSyncExternalStore(subscribe, () => version, () => version);
  return labels;
}

/** Página de detalhe: publica o nome do registro para o segmento `segment`. */
export function useBreadcrumbLabel(segment: string, label?: string | null) {
  useEffect(() => {
    if (!label) return;
    labels.set(segment, label);
    emit();
    return () => {
      labels.delete(segment);
      emit();
    };
  }, [segment, label]);
}
