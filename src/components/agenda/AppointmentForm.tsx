'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'

interface Option { id: string; name: string }

/**
 * Médico com as especialidades DELE.
 *
 * A especialidade do agendamento vem do cadastro do médico, não de uma lista
 * solta da clínica: antes o campo trazia todas as especialidades e já vinha na
 * primeira da lista, então dava para marcar o ortopedista como "Cardiologia" e
 * o relatório por especialidade virava ficção.
 */
interface Medico extends Option {
  specialtyIds?: string[]
  specialtyNames?: string[]
}

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
  const [professionals, setProfessionals] = useState<Medico[]>([])
  const [specialties, setSpecialties] = useState<Option[]>([])
  const [rooms, setRooms] = useState<Option[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [form, setForm] = useState({
    patientId: appointment?.patientId ?? '',
    professionalId: appointment?.professionalId ?? defaultProfessionalId ?? '',
    specialtyId: appointment?.specialtyId ?? '',
    roomId: appointment?.roomId ?? '',
    modality: appointment?.modality ?? 'PRESENCIAL',
    type: appointment?.type ?? 'Consulta',
    date: toDateInput(appointment?.startAt) || new Date().toISOString().split('T')[0],
    time: toTimeInput(appointment?.startAt) || '09:00',
    durationMinutes: appointment?.durationMinutes ?? 30,
    notes: appointment?.notes ?? '',
  })

  useEffect(() => {
    ;(async () => {
      const [p, pr, s, rm] = await Promise.all([
        fetch('/api/patients?limit=100').then((r) => (r.ok ? r.json() : { patients: [] })),
        fetch('/api/professionals?activeOnly=1').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/specialties').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/rooms').then((r) => (r.ok ? r.json() : [])),
      ])
      setPatients((p.patients ?? []).map((x: any) => ({ id: x.id, name: x.name })))
      setProfessionals(Array.isArray(pr) ? pr : [])
      setSpecialties(Array.isArray(s) ? s : [])
      setRooms(Array.isArray(rm) ? rm.map((x: any) => ({ id: x.id, name: x.name })) : [])
      setForm((f) => {
        const medicoId = f.professionalId || pr[0]?.id || ''
        const medico = (Array.isArray(pr) ? pr : []).find((m: Medico) => m.id === medicoId)
        const dele = medico?.specialtyIds ?? []
        return {
          ...f,
          professionalId: medicoId,
          // Especialidade sai do médico. Mantém a que já estava gravada quando
          // ainda pertence a ele (agendamento antigo continua editável).
          specialtyId: f.specialtyId && dele.includes(f.specialtyId) ? f.specialtyId : dele[0] ?? '',
        }
      })
    })()
  }, [])

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  const medico = professionals.find((m) => m.id === form.professionalId) ?? null
  // Especialidades DO médico escolhido, resolvidas em nome para o select.
  const especialidadesDoMedico = (medico?.specialtyIds ?? [])
    .map((id) => specialties.find((s) => s.id === id) ?? { id, name: 'Especialidade removida' })
  const semEspecialidade = !!medico && especialidadesDoMedico.length === 0
  const especialidadeUnica = especialidadesDoMedico.length === 1

  // Trocar de médico troca a especialidade — a do médico anterior não vale para
  // o novo, e deixar a antiga selecionada era o jeito silencioso de errar.
  function trocarMedico(id: string) {
    const alvo = professionals.find((m) => m.id === id)
    const dele = alvo?.specialtyIds ?? []
    setForm((f) => ({
      ...f,
      professionalId: id,
      specialtyId: f.specialtyId && dele.includes(f.specialtyId) ? f.specialtyId : dele[0] ?? '',
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.patientId) { setErr('Selecione um paciente'); return }
    if (!form.professionalId) { setErr('Selecione o(a) médico(a)'); return }
    // Trava dura: sem especialidade no cadastro do médico não há agendamento. É
    // o que mantém o relatório por especialidade honesto — e a saída está na
    // mensagem abaixo do campo, não numa escolha aleatória.
    if (!form.specialtyId) {
      setErr(
        semEspecialidade
          ? `${medico?.name ?? 'Este médico'} não tem especialidade cadastrada. Cadastre em Agenda → Médicos(as) e volte para agendar.`
          : 'Selecione a especialidade'
      )
      return
    }
    setSaving(true)
    try {
      const startAt = new Date(`${form.date}T${form.time}:00`).toISOString()
      await onSubmit({
        patientId: form.patientId,
        professionalId: form.professionalId,
        specialtyId: form.specialtyId,
        roomId: form.roomId || undefined,
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

  const field = 'w-full'
  const label = 'block text-sm font-medium text-foreground mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <div>
        <label className={label}>Paciente *</label>
        <FilterSelect className={field} value={form.patientId} onChange={(e) => set('patientId', e.target.value)} required>
          <option value="">Selecione um paciente</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FilterSelect>
        {patients.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nenhum paciente cadastrado — cadastre em Pacientes primeiro.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Médico(a) *</label>
          <FilterSelect className={field} value={form.professionalId} onChange={(e) => trocarMedico(e.target.value)} required>
            <option value="">Selecione o(a) médico(a)</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          {professionals.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum(a) médico(a) cadastrado(a) — cadastre em Agenda → Médicos(as).
            </p>
          )}
        </div>
        <div>
          <label className={label}>Especialidade *</label>
          {especialidadeUnica ? (
            // Uma só especialidade no cadastro: mostra qual é, sem select de uma
            // opção. É o caso comum e não há nada para escolher.
            <div className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground">
              {especialidadesDoMedico[0].name}
            </div>
          ) : (
            <FilterSelect
              className={field}
              value={form.specialtyId}
              onChange={(e) => set('specialtyId', e.target.value)}
              disabled={!medico || semEspecialidade}
              required
            >
              <option value="">
                {semEspecialidade ? 'Médico(a) sem especialidade cadastrada' : 'Selecione a especialidade'}
              </option>
              {especialidadesDoMedico.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
          )}
          {semEspecialidade ? (
            <p className="mt-1 text-xs text-destructive">
              Cadastre a especialidade de {medico?.name} em <a href="/agenda?tab=profissionais" className="underline">Agenda → Médicos(as)</a>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Vem do cadastro do(a) médico(a).</p>
          )}
        </div>
      </div>

      <div>
        <label className={label}>Sala</label>
        <FilterSelect className={field} value={form.roomId} onChange={(e) => set('roomId', e.target.value)}>
          <option value="">Sem sala definida</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </FilterSelect>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={label}>Data *</label>
          <Input type="date" className={field} value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
        <div>
          <label className={label}>Hora *</label>
          <Input type="time" className={field} value={form.time} onChange={(e) => set('time', e.target.value)} required />
        </div>
        <div>
          <label className={label}>Duração</label>
          <FilterSelect className={field} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </FilterSelect>
        </div>
        <div>
          <label className={label}>Tipo</label>
          <FilterSelect className={field} value={form.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>
        </div>
        <div>
          <label className={label}>Modalidade</label>
          <FilterSelect className={field} value={form.modality} onChange={(e) => set('modality', e.target.value)}>
            <option value="PRESENCIAL">Presencial</option>
            <option value="TELEMEDICINA">Teleconsulta</option>
          </FilterSelect>
        </div>
      </div>
      {form.modality === 'TELEMEDICINA' && (
        <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Uma sala de vídeo e o link do paciente serão gerados automaticamente, e o link será enviado por WhatsApp.
        </p>
      )}

      <div>
        <label className={label}>Observações</label>
        <Textarea className={field} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
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
