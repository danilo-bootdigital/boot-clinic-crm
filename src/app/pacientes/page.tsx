'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Users, Pencil, UserMinus } from 'lucide-react'
import PatientList from '@/components/patients/PatientList'
import PatientForm from '@/components/patients/PatientForm'
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
  const [viewArchived, setViewArchived] = useState(false)
  // FE2: paginação + busca/filtros SERVER-SIDE (antes a UI carregava 100 e filtrava
  // em memória — registros além de 100 sumiam e a busca só via os carregados).
  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ search: '', status: '', origin: '' })
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })

  const loadPatients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (viewArchived) qs.set('archived', 'true')
      if (filters.search.trim()) qs.set('search', filters.search.trim())
      if (filters.status) qs.set('status', filters.status)
      if (filters.origin) qs.set('origin', filters.origin)
      const res = await fetch(`/api/patients?${qs.toString()}`, { cache: 'no-store' })
      if (res.status === 401) {
        router.push('/login?redirect=/pacientes')
        return
      }
      if (!res.ok) throw new Error('Falha ao carregar pacientes')
      const data = await res.json()
      setPatients(data.patients ?? [])
      if (data.pagination) setPagination({ page: data.pagination.page, pages: data.pagination.pages, total: data.pagination.total })
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar pacientes')
    } finally {
      setLoading(false)
    }
  }, [router, viewArchived, page, filters])

  // Um único efeito com debounce (250ms) — cobre busca, filtros, página e arquivados
  // sem fetch duplicado. O reset para a página 1 é feito nos handlers (síncrono).
  useEffect(() => {
    const t = setTimeout(() => { loadPatients() }, 250)
    return () => clearTimeout(t)
  }, [loadPatients])

  // Mudou filtro/busca → volta para a página 1.
  const onFiltersChange = useCallback((next: { search: string; status: string; origin: string }) => {
    setFilters(next); setPage(1)
  }, [])
  const toggleArchived = useCallback(() => { setViewArchived((v) => !v); setPage(1) }, [])

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

  async function handleRestore(patient: Patient) {
    if (!confirm(`Restaurar o paciente ${patient.name}?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/patients/${patient.id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao restaurar paciente')
      }
      await loadPatients()
    } catch (e: any) {
      setError(e.message)
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
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleArchived}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${viewArchived ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {viewArchived ? '← Voltar aos ativos' : 'Ver arquivados'}
            </button>
            {viewArchived && <span className="text-sm text-muted-foreground">Mostrando pacientes inativados — clique em Restaurar para reativar.</span>}
          </div>
          {loading ? (
            <LoadingState rows={5} label="Carregando pacientes" />
          ) : (
            <PatientList
              patients={patients}
              onView={(p) => router.push(`/pacientes/${p.id}`)}
              onEdit={(p) => { setSelected(p as Patient); setMode('edit') }}
              onRestore={viewArchived ? handleRestore : undefined}
              filters={filters}
              onFiltersChange={onFiltersChange}
              pagination={pagination}
              onPageChange={setPage}
            />
          )}
        </>
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
            <Field label="Telefone" value={selected.phone || '—'} />
            <Field label="WhatsApp" value={selected.whatsapp || '—'} />
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
