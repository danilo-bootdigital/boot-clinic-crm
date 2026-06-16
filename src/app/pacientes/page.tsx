'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PatientList from '@/components/patients/PatientList'
import PatientForm from '@/components/patients/PatientForm'
import { formatPhone } from '@/lib/validations/patient'
import { createClient } from '@/lib/supabase/client'

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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

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

  const header = (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-3xl font-bold text-gray-900">Pacientes</h1>
      <div className="flex gap-3">
        {mode === 'list' && (
          <button
            onClick={() => { setSelected(null); setMode('create') }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Novo Paciente
          </button>
        )}
        {mode !== 'list' && (
          <button
            onClick={() => { setMode('list'); setSelected(null); setError(null) }}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            ← Voltar
          </button>
        )}
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700 px-2">
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {header}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === 'list' && (
          loading ? (
            <p className="text-gray-500">Carregando pacientes...</p>
          ) : (
            <PatientList
              patients={patients}
              onView={(p) => { setSelected(p as Patient); setMode('view') }}
              onEdit={(p) => { setSelected(p as Patient); setMode('edit') }}
            />
          )
        )}

        {mode === 'create' && (
          <PatientForm onSubmit={handleCreate} onCancel={() => setMode('list')} />
        )}

        {mode === 'edit' && selected && (
          <PatientForm
            patient={selected as any}
            onSubmit={handleUpdate}
            onCancel={() => { setMode('list'); setSelected(null) }}
          />
        )}

        {mode === 'view' && selected && (
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">{selected.name}</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div><dt className="text-gray-500">CPF</dt><dd className="text-gray-900">{selected.cpf}</dd></div>
              <div><dt className="text-gray-500">Telefone</dt><dd className="text-gray-900">{formatPhone(selected.phone)}</dd></div>
              <div><dt className="text-gray-500">WhatsApp</dt><dd className="text-gray-900">{selected.whatsapp ? formatPhone(selected.whatsapp) : '—'}</dd></div>
              <div><dt className="text-gray-500">E-mail</dt><dd className="text-gray-900">{selected.email || '—'}</dd></div>
              <div><dt className="text-gray-500">Nascimento</dt><dd className="text-gray-900">{selected.birthDate ? new Date(selected.birthDate).toLocaleDateString('pt-BR') : '—'}</dd></div>
              <div><dt className="text-gray-500">Gênero</dt><dd className="text-gray-900">{GENDER_LABELS[selected.gender] || selected.gender}</dd></div>
              <div><dt className="text-gray-500">Origem</dt><dd className="text-gray-900">{ORIGIN_LABELS[selected.origin] || selected.origin}</dd></div>
              <div><dt className="text-gray-500">Status</dt><dd className="text-gray-900">{STATUS_LABELS[selected.status] || selected.status}</dd></div>
            </dl>
            <div className="flex gap-3 pt-4 border-t">
              <button onClick={() => setMode('edit')} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Editar
              </button>
              <button onClick={() => handleDeactivate(selected)} className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100">
                Inativar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
