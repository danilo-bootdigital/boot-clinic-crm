// "Aguardando resposta" na lista de conversas — quanto tempo faz que a
// ÚLTIMA mensagem foi do paciente (INCOMING) sem a clínica ter respondido
// desde então. `awaitingSince` vem pronto da API (null = clínica já
// respondeu, ou conversa encerrada); aqui só formata e classifica a
// severidade pra colorir o badge.

/** "5 min" / "2h" / "3d" — compacto, cabe num badge da lista. */
export function waitingLabel(sinceIso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(sinceIso).getTime());
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  if (diffMs < MIN) return 'agora';
  if (diffMs < HOUR) return `${Math.floor(diffMs / MIN)} min`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}h`;
  return `${Math.floor(diffMs / DAY)}d`;
}

export type WaitingTone = 'neutral' | 'warning' | 'destructive';

/** Severidade pro badge — SLA informal: até 10min neutro, até 1h atenção, acima crítico. */
export function waitingTone(sinceIso: string, now: Date = new Date()): WaitingTone {
  const diffMs = now.getTime() - new Date(sinceIso).getTime();
  const MIN = 60_000, HOUR = 3_600_000;
  if (diffMs >= HOUR) return 'destructive';
  if (diffMs >= 10 * MIN) return 'warning';
  return 'neutral';
}
