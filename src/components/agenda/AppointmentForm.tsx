'use client'

import { useState, useEffect } from 'react'

interface Option { id: string; name: string }

interface AppointmentFormProps {
  appointment?: any
  defaultProfessionalId?: string
  onSubmit: (data: any) => void | Promise<void>
  onCancel: () => void
}

const TYPES = ['Consulta', 'Retorno', 'Exame', 'Avaliação']
const DURATIONS = [15, 30, 45, 60, 90, 120]

function toDateInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}
function toTimeInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5)
}

export function AppointmentForm({ appointment, defaultProfessionalId, onSubmit, onCancel }: AppointmentFormProps) {
  const [patients, setPatients] = useState<Option[]>([])
  const [professionals, setProfessionals] = useState<Option[]>([])
  const [specialties, setSpecialties] = useState<Option[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({
    patientId: appointment?.patientId ?? '',
    professionalId: appointment?.professionalId ?? defaultProfessionalId ?? '',
    specialtyId: appointment?.specialtyId ?? '',
    modality: appointment?.modality ?? 'PRESENCIAL',
    type: appointment?.type ?? 'Consulta',
    date: toDateInput(appointment?.startAt) || new Date().toISOString().split('T')[0],
    time: toTimeInput(appointment?.startAt) || '09:00',
    durationMinutes: appointment?.durationMinutes ?? 30,
    notes: appointment?.notes ?? '',
  })

  useEffect(() => {
    ;(async () => {
      const [p, pr, s] = await Promise.all([
        fetch('/api/patients?limit=100').then((r) => (r.ok ? r.json() : { patients: [] })),
        fetch('/api/professionals').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/specialties').then((r) => (r.ok ? r.json() : [])),
      ])
      setPatients((p.patients ?? []).map((x: any) => ({ id: x.id, name: x.name })))
      setProfessionals(pr)
      setSpecialties(s)
      setForm((f) => ({
        ...f,
        professionalId: f.professionalId || pr[0]?.id || '',
        specialtyId: f.specialtyId || s[0]?.id || '',
      }))
    })()
  }, [])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.patientId) { setErr('Selecione um paciente'); return }
    setSaving(true)
    try {
      const startAt = new Date(`${form.date}T${form.time}:00`).toISOString()
      await onSubmit({
        patientId: form.patientId,
        professionalId: form.professionalId,
        specialtyId: form.specialtyId,
        modality: form.modality,
        type: form.type,
        startAt,
        durationMinutes: Number(form.durationMinutes),
        notes: form.notes || undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring'
  const label = 'block text-sm font-medium text-foreground mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <div>
        <label className={label}>Paciente *</label>
        <select className={field} value={form.patientId} onChange={(e) => set('patientId', e.target.value)} required>
          <option value="">Selecione um paciente</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {patients.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nenhum paciente cadastrado — cadastre em Pacientes primeiro.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Profissional *</label>
          <select className={field} value={form.professionalId} onChange={(e) => set('professionalId', e.target.value)} required>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Especialidade *</label>
          <select className={field} value={form.specialtyId} onChange={(e) => set('specialtyId', e.target.value)} required>
            {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={label}>Data *</label>
          <input type="date" className={field} value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
        <div>
          <label className={label}>Hora *</label>
          <input type="time" className={field} value={form.time} onChange={(e) => set('time', e.target.value)} required />
        </div>
        <div>
          <label className={label}>Duração</label>
          <select className={field} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Tipo</label>
          <select className={field} value={form.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Modalidade</label>
          <select className={field} value={form.modality} onChange={(e) => set('modality', e.target.value)}>
            <option value="PRESENCIAL">Presencial</option>
            <option value="TELEMEDICINA">Teleconsulta</option>
          </select>
        </div>
      </div>
      {form.modality === 'TELEMEDICINA' && (
        <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Uma sala de vídeo e o link do paciente serão gerados automaticamente, e o link será enviado por WhatsApp.
        </p>
      )}

      <div>
        <label className={label}>Observações</label>
        <textarea className={field} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted">Cancelar</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

export default AppointmentForm
