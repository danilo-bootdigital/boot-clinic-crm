// Datas de tarefas (dueDate) — compartilhado entre as rotas de API do módulo
// Tarefas. Datas "YYYY-MM-DD" são interpretadas ao meio-dia LOCAL: evita que a
// meia-noite UTC caia no dia anterior em fusos negativos (America/Sao_Paulo),
// o que jogaria a tarefa para "atrasada" um dia antes da hora.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDueDate(input: string): Date {
  return new Date(DATE_ONLY.test(input) ? `${input}T12:00:00` : input);
}

// "Hoje"/"esta semana" para os filtros de Tarefas: o processo Node roda em
// horário do servidor (pode ser UTC na Vercel), não em America/Sao_Paulo. Ler
// a data via getFullYear()/getMonth()/getDate() do servidor erraria o dia da
// clínica durante a noite (BR = UTC-3): 21h-23h59 em São Paulo já seria
// "amanhã" em UTC. Em vez disso, formata `now` explicitamente no fuso da
// clínica e monta os limites a partir dessa string — a mesma técnica que
// `parseDueDate` usa para o dueDate informado (string local sem offset).
const brFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" do dia da clínica (America/Sao_Paulo) para o instante `now`. */
export function brDateString(now: Date = new Date()): string {
  return brFmt.format(now); // en-CA já formata como YYYY-MM-DD
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Início do dia (00:00) do dia da clínica que contém `now`. */
export function brTodayStart(now: Date = new Date()): Date {
  return new Date(`${brDateString(now)}T00:00:00`);
}

/** Início do dia seguinte ao dia da clínica que contém `now` (limite exclusivo de "hoje"). */
export function brTomorrowStart(now: Date = new Date()): Date {
  return new Date(`${addDaysToDateString(brDateString(now), 1)}T00:00:00`);
}

/** Início da semana (domingo) que contém `now`, no fuso da clínica. */
export function brWeekStart(now: Date = new Date()): Date {
  const todayStr = brDateString(now);
  const weekday = new Date(`${todayStr}T00:00:00`).getDay(); // 0=domingo
  return new Date(`${addDaysToDateString(todayStr, -weekday)}T00:00:00`);
}

/** Início da semana seguinte (limite exclusivo de "esta semana"), no fuso da clínica. */
export function brWeekEnd(now: Date = new Date()): Date {
  const start = brWeekStart(now);
  const startStr = brDateString(start);
  return new Date(`${addDaysToDateString(startStr, 7)}T00:00:00`);
}
