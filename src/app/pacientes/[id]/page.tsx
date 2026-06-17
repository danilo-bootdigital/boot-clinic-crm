'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { User, ArrowLeft, Pencil, UserMinus } from 'lucide-react'
import PatientForm from '@/components/patients/PatientForm'
import Timeline from '@/components/patients/Timeline'
import Tags from '@/components/patients/Tags'
import Attachments from '@/components/patients/Attachments'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { formatPhone } from '@/lib/validations/patient'

const ORIGIN_LABELS: Record<string, string> = {
  GOOGLE: 'Google', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', REFERRAL: 'Indicação',
  WALK_IN: 'Passagem', PHONE: 'Telefone', WHATSAPP: 'WhatsApp', OTHER: 'Outro',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado' }
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Masculino', FEMALE: 'Feminino', OTHER: 'Outro', PREFER_NOT_TO_SAY: 'Prefiro não informar',
}

// Abas ativas + futuras (preparadas, ainda não implementadas).
const TABS = [
  { key: 'dados', label: 'Dados', enabled: true },
  { key: 'timeline', label: 'Timeline', enabled: true },
  { key: 'tags', label: 'Tags', enabled: true },
  { key: 'anexos', label: 'Anexos', enabled: true },
  { key: 'anamnese', label: 'Anamnese', enabled: false },
  { key: 'prontuario', label: 'Prontuário', enabled: false },
  { key: 'contratos', label: 'Contratos', enabled: false },
  { key: 'orcamentos', label: 'Orçamentos', enabled: false },
  { key: 'imagens', label: 'Imagens', enabled: false },
]

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const id = params.id
  const [patient, setPatient] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dados')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/patients/${id}`, { cache: 'no-store' })
    if (res.status === 401) { router.push(`/login?redirect=/pacientes/${id}`); return }
    if (res.status === 404) { setError('Paciente não encontrado'); setLoading(false); return }
    if (res.ok) setPatient(await res.json())
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function handleUpdate(formData: any) {
    setError(null)
    const { cpf, ...payload } = formData
    const res = await fetch(`/api/patients/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (res.ok) { setEditing(false); load() }
    else { const e = await res.json().catch(() => ({})); setError(e.error || 'Falha ao atualizar') }
  }

  async function inativar() {
    if (!confirm(`Inativar o paciente ${patient.name}?`)) return
    const res = await fetch(`/api/patients/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/pacientes')
    else { const e = await res.json().catch(() => ({})); setError(e.error || 'Falha ao inativar') }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Detalhes do Paciente" icon={<User className="h-5 w-5" />} /><LoadingState rows={6} /></div>
  if (error && !patient) return (
    <div className="space-y-6">
      <PageHeader title="Detalhes do Paciente" icon={<User className="h-5 w-5" />} />
      <SectionCard><p className="text-sm text-muted-foreground">{error}</p></SectionCard>
    </div>
  )
  if (!patient) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={patient.name}
        description={`${STATUS_LABELS[patient.status] || patient.status} · ${patient.cpf}`}
        icon={<User className="h-5 w-5" />}
        actions={
          <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => router.push('/pacientes')}>
            Voltar
          </ActionButton>
        }
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            disabled={!t.enabled}
            onClick={() => t.enabled && setTab(t.key)}
            title={t.enabled ? undefined : 'Em breve'}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? 'border-primary text-foreground'
              : t.enabled ? 'border-transparent text-muted-foreground hover:text-foreground'
              : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
            }`}
          >
            {t.label}{!t.enabled && ' ·'}
          </button>
        ))}
      </div>

      {tab === 'dados' && (
        editing ? (
          <SectionCard title="Editar paciente">
            <PatientForm patient={patient} onSubmit={handleUpdate} onCancel={() => setEditing(false)} />
          </SectionCard>
        ) : (
          <SectionCard title="Dados do paciente">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="CPF" value={patient.cpf} />
              <Field label="Nascimento" value={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('pt-BR') : '—'} />
              <Field label="Gênero" value={GENDER_LABELS[patient.gender] || patient.gender} />
              <Field label="Telefone" value={patient.phone ? formatPhone(patient.phone) : '—'} />
              <Field label="WhatsApp" value={patient.whatsapp ? formatPhone(patient.whatsapp) : '—'} />
              <Field label="E-mail" value={patient.email || '—'} />
              <Field label="Endereço" value={patient.address || '—'} />
              <Field label="Cidade" value={patient.city || '—'} />
              <Field label="Estado" value={patient.state || '—'} />
              <Field label="CEP" value={patient.zipCode || '—'} />
              <Field label="Convênio" value={patient.insurance || '—'} />
              <Field label="Carteirinha" value={patient.insuranceNumber || '—'} />
              <Field label="Origem" value={ORIGIN_LABELS[patient.origin] || patient.origin} />
              <Field label="Status" value={STATUS_LABELS[patient.status] || patient.status} />
              <Field label="Cadastrado por" value={patient.createdBy?.name || '—'} />
              <Field label="Observações" value={patient.notes || '—'} full />
            </dl>
            <div className="mt-6 flex gap-3 border-t border-border pt-5">
              <ActionButton icon={<Pencil />} onClick={() => setEditing(true)}>Editar</ActionButton>
              <ActionButton variant="outline" icon={<UserMinus />} onClick={inativar}
                className="border-destructive/30 text-destructive hover:bg-destructive/10">
                Inativar
              </ActionButton>
            </div>
          </SectionCard>
        )
      )}

      {tab === 'timeline' && <Timeline patientId={id} />}
      {tab === 'tags' && <Tags patientId={id} />}
      {tab === 'anexos' && <Attachments patientId={id} />}
    </div>
  )
}

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}
