// Metadados visuais de status da Agenda — fonte única de verdade para rótulos e
// cores (badges + cards de evento). Usa apenas tokens do Design System
// (incl. --status-realizado/--status-falta adicionados em globals.css). Sem cor
// hardcoded e sem identidade visual paralela.

export type AgendaStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'RESCHEDULED'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'BLOCK'

export interface StatusMeta {
  label: string
  /** classes do badge (StatusBadge custom) */
  badge: string
  /** cor do "ponto" do badge */
  dot: string
  /** classes do card de evento na grade (fundo + barra lateral) */
  event: string
  /** cor sólida usada em legendas/realces */
  solid: string
}

const META: Record<AgendaStatus, StatusMeta> = {
  CONFIRMED: {
    label: 'Confirmado',
    badge: 'bg-success/10 text-success ring-success/20',
    dot: 'bg-success',
    event: 'bg-success/[0.07] border-l-success hover:bg-success/[0.12]',
    solid: 'bg-success',
  },
  PENDING: {
    label: 'Pendente',
    badge: 'bg-warning/15 text-warning-strong ring-warning/30',
    dot: 'bg-warning',
    event: 'bg-warning/[0.08] border-l-warning hover:bg-warning/[0.14]',
    solid: 'bg-warning',
  },
  CANCELED: {
    label: 'Cancelado',
    badge: 'bg-destructive/10 text-destructive ring-destructive/20',
    dot: 'bg-destructive',
    event: 'bg-destructive/[0.06] border-l-destructive hover:bg-destructive/[0.12] opacity-75',
    solid: 'bg-destructive',
  },
  ATTENDED: {
    label: 'Realizado',
    badge:
      'bg-[hsl(var(--status-realizado)/0.12)] text-[hsl(var(--status-realizado))] ring-[hsl(var(--status-realizado)/0.25)]',
    dot: 'bg-[hsl(var(--status-realizado))]',
    event:
      'bg-[hsl(var(--status-realizado)/0.07)] border-l-[hsl(var(--status-realizado))] hover:bg-[hsl(var(--status-realizado)/0.13)]',
    solid: 'bg-[hsl(var(--status-realizado))]',
  },
  NO_SHOW: {
    label: 'Faltou',
    badge:
      'bg-[hsl(var(--status-falta)/0.12)] text-[hsl(var(--status-falta))] ring-[hsl(var(--status-falta)/0.25)]',
    dot: 'bg-[hsl(var(--status-falta))]',
    event:
      'bg-[hsl(var(--status-falta)/0.08)] border-l-[hsl(var(--status-falta))] hover:bg-[hsl(var(--status-falta)/0.14)]',
    solid: 'bg-[hsl(var(--status-falta))]',
  },
  RESCHEDULED: {
    label: 'Remarcado',
    badge: 'bg-primary/10 text-primary ring-primary/20',
    dot: 'bg-primary',
    event: 'bg-primary/[0.06] border-l-primary hover:bg-primary/[0.12]',
    solid: 'bg-primary',
  },
  BLOCK: {
    label: 'Bloqueio',
    badge: 'bg-muted text-muted-foreground ring-border',
    dot: 'bg-muted-foreground',
    event:
      'bg-[repeating-linear-gradient(45deg,hsl(var(--muted)),hsl(var(--muted))_6px,transparent_6px,transparent_12px)] border-l-muted-foreground text-muted-foreground hover:bg-muted',
    solid: 'bg-muted-foreground',
  },
}

export function statusMeta(status?: string | null): StatusMeta {
  return META[(status as AgendaStatus) ?? 'PENDING'] ?? META.PENDING
}

/** Ordem e itens para a legenda de cores. */
export const STATUS_LEGEND: AgendaStatus[] = [
  'CONFIRMED',
  'PENDING',
  'ATTENDED',
  'NO_SHOW',
  'CANCELED',
  'BLOCK',
]
