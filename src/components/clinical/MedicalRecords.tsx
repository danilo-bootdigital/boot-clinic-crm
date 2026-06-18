'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ArrowLeft } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/components/ui/action-button'
import { MEDICAL_RECORD_TYPES, RECORD_TYPE_LABELS } from '@/lib/validations/clinical'

const field = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function MedicalRecords({ patientId, canEdit = true }: { patientId: string; canEdit?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [professionals, setProfessionals] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ type: 'EVOLUTION', title: '', content: '', professionalId: '' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/medical-records`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => {
    load()
    fetch('/api/professionals').then((r) => r.ok ? r.json() : []).then((d) => setProfessionals(Array.isArray(d) ? d : (d.professionals ?? []))).catch(() => {})
  }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch(`/api/patients/${patientId}/medical-records`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, professionalId: form.professionalId || undefined }),
    })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar registro'); return }
    setCreating(false); setForm({ type: 'EVOLUTION', title: '', content: '', professionalId: '' }); load()
  }

  return (
    <SectionCard
      title="Prontuário"
      description="Evolução clínica, observações e histórico de atendimento"
      actions={canEdit && (creating
        ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setError(null) }}>Voltar</ActionButton>
        : <ActionButton icon={<Plus />} onClick={() => setCreating(true)}>Novo registro</ActionButton>)}
    >
      {!canEdit && <p className="mb-3 text-xs text-muted-foreground">Você tem acesso somente de leitura ao prontuário.</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {creating ? (
        <form onSubmit={create} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {MEDICAL_RECORD_TYPES.map((t) => <option key={t} value={t}>{RECORD_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profissional</label>
              <select className={field} value={form.professionalId} onChange={(e) => setForm({ ...form, professionalId: e.target.value })}>
                <option value="">—</option>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo *</label>
            <textarea className={field} rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">Salvar</button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro no prontuário.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge tone="info" dot={false}>{RECORD_TYPE_LABELS[r.type] || r.type}</StatusBadge>
                  <span className="text-sm font-medium text-foreground">{r.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {r.professionalName ? `Profissional: ${r.professionalName} · ` : ''}Registrado por {r.createdByName || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
