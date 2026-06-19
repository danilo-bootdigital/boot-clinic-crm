'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ArrowLeft, Send, CheckCircle2, XCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/components/ui/action-button'
import { CONTRACT_STATUS_LABELS, renderContractContent } from '@/lib/validations/clinical'

const STATUS_TONE: Record<string, any> = { DRAFT: 'warning', SENT: 'info', SIGNED: 'success', CANCELED: 'destructive' }
const field = 'w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export default function Contracts({ patient, canEdit = true }: { patient: any; canEdit?: boolean }) {
  const patientId = patient.id
  const [rows, setRows] = useState<any[] | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', templateId: '', content: '', value: '', procedure: '' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/contracts`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => {
    load()
    fetch('/api/clinico/contract-templates').then((r) => r.ok ? r.json() : []).then(setTemplates).catch(() => {})
  }, [load])

  function buildVars() {
    return {
      nome_paciente: patient.name, cpf: patient.cpf, procedimento: form.procedure,
      valor: form.value ? `R$ ${Number(form.value).toFixed(2)}` : '', clinica: '',
      profissional: '', data: new Date().toLocaleDateString('pt-BR'),
    }
  }

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    setForm((f) => ({ ...f, templateId: id, title: f.title || tpl?.name || '', content: tpl ? renderContractContent(tpl.content, buildVars()) : f.content }))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch(`/api/patients/${patientId}/contracts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title, templateId: form.templateId || undefined, content: form.content,
        value: form.value ? Number(form.value) : undefined, variables: buildVars(), status: 'DRAFT',
      }),
    })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao gerar contrato'); return }
    setCreating(false); setForm({ title: '', templateId: '', content: '', value: '', procedure: '' }); load()
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/clinico/contracts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  return (
    <SectionCard
      title="Contratos"
      description="Contratos personalizáveis do paciente"
      actions={canEdit && (creating
        ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setError(null) }}>Voltar</ActionButton>
        : <ActionButton icon={<Plus />} onClick={() => setCreating(true)}>Novo contrato</ActionButton>)}
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {creating ? (
        <form onSubmit={create} className="space-y-4 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Modelo</label>
              <select className={field} value={form.templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">— Sem modelo —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Valor (R$)</label>
              <input type="number" step="0.01" className={field} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Procedimento</label>
            <input className={field} value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} placeholder="ex.: Avaliação inicial" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
            <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Conteúdo * <span className="text-xs text-muted-foreground">(variáveis {'{{nome_paciente}}'}, {'{{cpf}}'}, {'{{valor}}'}, {'{{data}}'} já resolvidas)</span></label>
            <textarea className={field} rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="submit" className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90">Gerar contrato</button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato gerado.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{c.title}</span>
                  <StatusBadge tone={STATUS_TONE[c.status]}>{CONTRACT_STATUS_LABELS[c.status] || c.status}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.value != null ? `R$ ${Number(c.value).toFixed(2)} · ` : ''}{new Date(c.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {canEdit && c.status !== 'CANCELED' && c.status !== 'SIGNED' && (
                <div className="flex shrink-0 gap-1">
                  {c.status === 'DRAFT' && <button onClick={() => setStatus(c.id, 'SENT')} title="Marcar enviado" className="p-2 rounded-md text-primary hover:bg-accent"><Send className="h-4 w-4" /></button>}
                  <button onClick={() => setStatus(c.id, 'SIGNED')} title="Marcar assinado" className="p-2 rounded-md text-success hover:bg-success/10"><CheckCircle2 className="h-4 w-4" /></button>
                  <button onClick={() => setStatus(c.id, 'CANCELED')} title="Cancelar" className="p-2 rounded-md text-destructive hover:bg-destructive/10"><XCircle className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
