// Tipos compartilhados do módulo Agenda (frontend). Espelham o shape enriquecido
// devolvido por GET /api/agenda/appointments e GET /api/schedule-blocks.

export interface Appointment {
  id: string
  patientId: string
  professionalId: string
  specialtyId: string
  type: string
  status: string
  modality?: string
  roomId?: string | null
  startAt: string
  endAt: string
  durationMinutes: number
  notes?: string | null
  source?: string
  patient?: { id: string; name: string; phone?: string | null } | null
  professional?: { id: string; name: string } | null
  specialty?: { id: string; name: string } | null
  room?: { id: string; name: string } | null
}

export interface ScheduleBlock {
  id: string
  professionalId: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  reason?: string | null
  isRecurring?: boolean
}

export interface Professional {
  id: string
  name: string
}

export interface AgendaFiltersState {
  professionalId: string
  specialtyId: string
  roomId: string
  status: string
  type: string
  patient: string
}

export const EMPTY_FILTERS: AgendaFiltersState = {
  professionalId: '',
  specialtyId: '',
  roomId: '',
  status: '',
  type: '',
  patient: '',
}
