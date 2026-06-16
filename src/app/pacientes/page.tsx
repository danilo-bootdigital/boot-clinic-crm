'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Users, Pencil, UserMinus } from 'lucide-react'
import PatientList from '@/components/patients/PatientList'
import PatientForm from '@/components/patients/PatientForm'
import { formatPhone } from '@/lib/validations/patient'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'

interface Patient {
  id: string
  name: string
  cpf: string
  phone: string
  email?: string | null
  status: string
  origin: string
  birthDate: string
  gender: string
  whatsapp?: string | null
  createdAt: string
}

type Mode = 'list' | 'create' | 'edit' | 'view'

const ORIGIN_LABELS: Record<string, string> = {
  GOOGLE: 'Google', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', REFERRAL: 'Indicação',
  WALK_IN: 'Passagem', PHONE: 'Telefone', WHATSAPP: 'WhatsApp', OTHER: 'Outro',
}
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado' }
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Masculino', FEMALE: 'Feminino', OTHER: 'Outro', PREFER_NOT_TO_SAY: 'Prefiro não informar',
}

const TITLES: Record<Mode, string> = {
  list: 'Pacientes',
  create: 'Novo Paciente',
  edit: 'Editar Paciente',
  view: 'Detalhes do Paciente',
}

export default function PacientesPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('list')
  const [selected, setSelected] = useState<Patient | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPatients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patients?limit=100', { cache: 'no-store' })
      if (res.status === 401) {
        router.push('/login?redirect=/pacientes')
        return
      }
      if (!res.ok) throw new Error('Falha ao carregar pacientes')
      const data = await res.json()
      setPatients(data.patients ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar pacientes')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  async function handleCreate(formData: any) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao criar paciente')
      }
      await loadPatients()
      setMode('list')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(formData: any) {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      // CPF é imutável no backend; não enviamos.
      const { cpf, ...payload } = formData
      const res = await fetch(`/api/patients/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao atualizar paciente')
      }
      await loadPatients()
      setMode('list')
      setSelected(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(patient: Patient) {
    if (!confirm(`Inativar o paciente ${patient.name}?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/patients/${patient.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao inativar paciente')
      }
      await loadPatients()
      setMode('list')
      setSelected(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLES[mode]}
        description={mode === 'list' ? 'Gestão de pacientes e histórico clínico' : undefined}
        icon={<Users className="h-5 w-5" />}
        actions={
          mode === 'list' ? (
            <ActionButton icon={<Plus />} onClick={() => { setSelected(null); setMode('create') }}>
              Novo Paciente
            </ActionButton>
          ) : (
            <ActionButton
              variant="outline"
              icon={<ArrowLeft />}
              onClick={() => { setMode('list'); setSelected(null); setError(null) }}
            >
              Voltar
            </ActionButton>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {mode === 'list' && (
        loading ? (
          <LoadingState rows={5} label="Carregando pacientes" />
        ) : (
          <PatientList
            patients={patients}
            onView={(p) => { setSelected(p as Patient); setMode('view') }}
            onEdit={(p) => { setSelected(p as Patient); setMode('edit') }}
          />
        )
      )}

      {mode === 'create' && (
        <SectionCard>
          <PatientForm onSubmit={handleCreate} onCancel={() => setMode('list')} />
        </SectionCard>
      )}

      {mode === 'edit' && selected && (
        <SectionCard>
          <PatientForm
            patient={selected as any}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setSelected(null) }}
          />
        </SectionCard>
      )}

      {mode === 'view' && selected && (
        <SectionCard title={selected.name} className="max-w-3xl">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="CPF" value={selected.cpf} />
            <Field label="Telefone" value={formatPhone(selected.phone)} />
            <Field label="WhatsApp" value={selected.whatsapp ? formatPhone(selected.whatsapp) : '—'} />
            <Field label="E-mail" value={selected.email || '—'} />
            <Field label="Nascimento" value={selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('pt-BR') : '—'} />
            <Field label="Gênero" value={GENDER_LABELS[selected.gender] || selected.gender} />
            <Field label="Origem" value={ORIGIN_LABELS[selected.origin] || selected.origin} />
            <Field label="Status" value={STATUS_LABELS[selected.status] || selected.status} />
          </dl>
          <div className="mt-6 flex gap-3 border-t border-border pt-5">
            <ActionButton icon={<Pencil />} onClick={() => setMode('edit')}>
              Editar
            </ActionButton>
            <ActionButton variant="outline" icon={<UserMinus />} onClick={() => handleDeactivate(selected)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10">
              Inativar
            </ActionButton>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}
