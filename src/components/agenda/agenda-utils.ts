// Helpers puros de data/layout da Agenda. Sem dependências externas (o projeto
// não usa date-fns/dayjs). Tudo determinístico e memo-friendly.

export type AgendaView = 'day' | 'week' | 'month'

// Janela de horários da grade (DIA/SEMANA).
export const START_HOUR = 7
export const END_HOUR = 21 // exclusivo — última linha 20:30
export const SLOT_MIN = 30
export const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60

/** 'YYYY-MM-DD' no fuso local (não usar toISOString, que desloca p/ UTC). */
export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export function isSameDay(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b)
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

/** Segunda-feira da semana de `d` (semana Seg→Dom). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const dow = x.getDay() // 0=Dom ... 6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(x, diff)
}

/** Os 7 dias (Seg→Dom) da semana de `d`. */
export function weekDays(d: Date): Date[] {
  const start = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Matriz do mês (semanas de 7 dias, Seg→Dom), incluindo dias vizinhos p/ completar a grade. */
export function monthMatrix(d: Date): Date[][] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const weeks: Date[][] = []
  let cursor = gridStart
  // 6 linhas cobrem qualquer mês.
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    weeks.push(row)
    cursor = addDays(cursor, 7)
    // Para se a próxima linha já passou do mês e a semana anterior fechou o mês.
    if (cursor.getMonth() !== d.getMonth() && row[6].getMonth() !== d.getMonth() && w >= 4) break
  }
  return weeks
}

/** Intervalo [from, to) (Date) a buscar na API para a visão/cursor atuais. */
export function periodRange(view: AgendaView, cursor: Date): { from: Date; to: Date } {
  if (view === 'day') {
    const from = startOfDay(cursor)
    return { from, to: addDays(from, 1) }
  }
  if (view === 'week') {
    const from = startOfWeek(cursor)
    return { from, to: addDays(from, 7) }
  }
  // month: cobre toda a matriz exibida (inclui dias vizinhos)
  const weeks = monthMatrix(cursor)
  const from = weeks[0][0]
  const last = weeks[weeks.length - 1][6]
  return { from, to: addDays(last, 1) }
}

export function shiftCursor(view: AgendaView, cursor: Date, dir: -1 | 1): Date {
  if (view === 'day') return addDays(cursor, dir)
  if (view === 'week') return addDays(cursor, dir * 7)
  return addMonths(cursor, dir)
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function monthYearLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function weekdayShort(d: Date): string {
  return WEEKDAYS_SHORT[d.getDay()]
}

/** Rótulo do período exibido na toolbar. */
export function periodLabel(view: AgendaView, cursor: Date): string {
  if (view === 'day') {
    return cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  if (view === 'week') {
    const days = weekDays(cursor)
    const a = days[0]
    const b = days[6]
    const sameMonth = a.getMonth() === b.getMonth()
    const left = a.toLocaleDateString('pt-BR', { day: 'numeric', month: sameMonth ? undefined : 'short' })
    const right = b.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${left} – ${right}`
  }
  return monthYearLabel(cursor)
}

/** Lista de horários "HH:mm" (linhas das grades dia/semana). */
export function timeSlots(): string[] {
  const out: string[] = []
  for (let h = START_HOUR; h < END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
}

export function hourLabels(): string[] {
  const out: string[] = []
  for (let h = START_HOUR; h < END_HOUR; h++) out.push(`${String(h).padStart(2, '0')}:00`)
  return out
}

export function fmtTime(iso?: string | Date | null): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Minutos desde START_HOUR (clampado à janela visível). */
export function minutesFromStart(d: Date): number {
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes()
  return Math.max(0, Math.min(TOTAL_MINUTES, mins))
}

export interface PositionedEvent<T> {
  item: T
  /** % do topo (0–100) */
  top: number
  /** % de altura (0–100) */
  height: number
  /** coluna (lane) dentro de sobreposições */
  lane: number
  /** total de lanes do cluster */
  lanes: number
}

/**
 * Posiciona eventos numa coluna de tempo, distribuindo sobreposições em lanes
 * (estilo Google Calendar). `start`/`end` em ms.
 */
export function layoutColumn<T extends { start: number; end: number }>(
  events: T[],
): PositionedEvent<T>[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: PositionedEvent<T>[] = []
  // Agrupa em clusters de eventos que se encadeiam por sobreposição.
  let cluster: T[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const lanes: number[] = [] // fim (ms) de cada lane
    const assigned = cluster.map((ev) => {
      let lane = lanes.findIndex((end) => end <= ev.start)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(ev.end)
      } else {
        lanes[lane] = ev.end
      }
      return { ev, lane }
    })
    const total = lanes.length
    for (const { ev, lane } of assigned) {
      const startD = new Date(ev.start)
      const endD = new Date(ev.end)
      const top = (minutesFromStart(startD) / TOTAL_MINUTES) * 100
      const rawH = ((minutesFromStart(endD) - minutesFromStart(startD)) / TOTAL_MINUTES) * 100
      result.push({ item: ev, top, height: Math.max(rawH, 2.5), lane, lanes: total })
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const ev of sorted) {
    if (cluster.length && ev.start >= clusterEnd) flush()
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, ev.end)
  }
  flush()
  return result
}
