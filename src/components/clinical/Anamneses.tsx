'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ArrowLeft, Check, Archive, Pencil } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/components/ui/action-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'
import { ANAMNESIS_STATUS_LABELS } from '@/lib/validations/clinical'

const STATUS_TONE: Record<string, any> = { DRAFT: 'warning', FILLED: 'info', REVIEWED: 'success', ARCHIVED: 'neutral' }

const NOTES_PLACEHOLDER =
  'Digite aqui as informações da anamnese, histórico do paciente, queixas, observações clínicas e demais informações relevantes...'

export default function Anamneses({ patientId, canEdit = true }: { patientId: string; canEdit?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ notes?: string }>({})
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [notes, setNotes] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/anamneses`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => {
    load()
    fetch('/api/clinico/anamnese-templates').then((r) => r.ok ? r.json() : []).then(setTemplates).catch(() => {})
  }, [load])

  const selectedTemplate = templates.find((t) => t.id === templateId)

  function resetForm() {
    setCreating(false); setEditingId(null); setError(null); setFieldError({})
    setTitle(''); setTemplateId(''); setNotes(''); setAnswers({})
  }

  function startCreate() {
    resetForm(); setCreating(true)
  }

  function startEdit(a: any) {
    setError(null); setFieldError({})
    setEditingId(a.id)
    setCreating(true)
    setTitle(a.title || '')
    setTemplateId(a.templateId || '')
    setNotes(a.notes || '')
    const map: Record<string, string> = {}
    for (const ans of a.answers || []) if (ans.questionId) map[ans.questionId] = ans.value ?? ''
    setAnswers(map)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null); setFieldError({})

    const trimmedNotes = notes.trim()
    // Modo texto livre: conteúdo é obrigatório.
    if (!selectedTemplate && !trimmedNotes) {
      setFieldError({ notes: 'Informe o conteúdo da anamnese.' })
      return
    }
    // Modo com modelo: respeita as perguntas obrigatórias.
    if (selectedTemplate) {
      const missing = (selectedTemplate.questions || []).find(
        (q: any) => q.required && !(answers[q.id] && answers[q.id].trim()),
      )
      if (missing) { setError(`Responda a pergunta obrigatória: ${missing.label}`); return }
    }

    const payload: any = { title, templateId: templateId || undefined, notes, status: 'FILLED' }
    if (selectedTemplate) {
      payload.answers = (selectedTemplate.questions || []).map((q: any) => ({
        questionId: q.id, label: q.label, value: answers[q.id] ?? '',
      }))
    }

    setSaving(true)
    try {
      const url = editingId ? `/api/clinico/anamneses/${editingId}` : `/api/patients/${patientId}/anamneses`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const er = await res.json().catch(() => ({}))
        if (er.field === 'notes') setFieldError({ notes: er.error })
        else setError(er.error || 'Falha ao salvar anamnese')
        return
      }
      resetForm(); load()
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/clinico/anamneses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  const notesLabel = selectedTemplate ? 'Observações complementares' : 'Conteúdo da anamnese'

  return (
    <SectionCard
      title="Anamnese"
      description="Anamneses digitais do paciente"
      actions={canEdit && (creating
        ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={resetForm}>Voltar</ActionButton>
        : <ActionButton icon={<Plus />} onClick={startCreate}>Nova anamnese</ActionButton>)}
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {creating ? (
        <form onSubmit={submit} className="space-y-4 max-w-4xl">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
            <Input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Modelo (opcional)</label>
            <FilterSelect
              className="w-full"
              value={templateId}
              disabled={!!editingId}
              onChange={(e) => { setTemplateId(e.target.value); setAnswers({}); setFieldError({}) }}
            >
              <option value="">— Sem modelo (texto livre) —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.specialty ? ` · ${t.specialty}` : ''}</option>)}
            </FilterSelect>
            {editingId && <p className="mt-1 text-xs text-muted-foreground">O modelo não pode ser alterado em uma anamnese já criada.</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {notesLabel}{!selectedTemplate && ' *'}
            </label>
            <Textarea
              className="w-full min-h-[20rem] resize-y leading-relaxed"
              rows={14}
              value={notes}
              onChange={(e) => { setNotes(e.target.value); if (fieldError.notes) setFieldError({}) }}
              placeholder={NOTES_PLACEHOLDER}
              aria-invalid={!!fieldError.notes}
              aria-describedby={fieldError.notes ? 'anamnese-notes-error' : undefined}
            />
            {fieldError.notes && <p id="anamnese-notes-error" className="mt-1 text-sm text-destructive">{fieldError.notes}</p>}
          </div>

          {selectedTemplate?.questions?.map((q: any) => (
            <div key={q.id}>
              <label className="block text-sm font-medium text-foreground mb-1">{q.label}{q.required && ' *'}</label>
              {q.type === 'BOOLEAN' ? (
                <FilterSelect className="w-full" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">—</option><option value="Sim">Sim</option><option value="Não">Não</option>
                </FilterSelect>
              ) : (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE') && Array.isArray(q.options) ? (
                <FilterSelect className="w-full" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">—</option>{q.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </FilterSelect>
              ) : q.type === 'TEXTAREA' ? (
                <Textarea className="w-full" rows={3} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              ) : (
                <Input type={q.type === 'NUMBER' ? 'number' : q.type === 'DATE' ? 'date' : 'text'} className="w-full"
                  value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar'}
            </button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma anamnese registrada.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((a) => (
            <div key={a.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{a.title}</span>
                    <StatusBadge tone={STATUS_TONE[a.status]}>{ANAMNESIS_STATUS_LABELS[a.status] || a.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.createdAt).toLocaleString('pt-BR')} · {a.answers?.length || 0} resposta(s)</p>
                </div>
                {canEdit && a.status !== 'ARCHIVED' && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(a)} title="Editar" className="p-2 rounded-md text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                    {a.status !== 'REVIEWED' && <button onClick={() => setStatus(a.id, 'REVIEWED')} title="Marcar revisada" className="p-2 rounded-md text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>}
                    <button onClick={() => setStatus(a.id, 'ARCHIVED')} title="Arquivar" className="p-2 rounded-md text-muted-foreground hover:bg-muted"><Archive className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              {a.notes && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-muted-foreground">{a.templateId ? 'Observações complementares' : 'Conteúdo'}</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{a.notes}</p>
                </div>
              )}
              {a.answers?.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {a.answers.map((ans: any) => (
                    <div key={ans.id} className="text-xs">
                      <dt className="font-medium text-muted-foreground">{ans.label}</dt>
                      <dd className="text-foreground whitespace-pre-wrap break-words">{ans.value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
