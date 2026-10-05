'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CONTRACT_VARIABLE_GROUPS } from '@/lib/contracts/variables'

// Modelos de contrato da clínica. O texto leva campos {{...}} que, ao gerar o
// contrato de um paciente, são trocados pelos dados do cadastro dele.

type Tpl = { id: string; name: string; description: string | null; content: string; isActive: boolean }
const EMPTY = { name: '', description: '', content: '', isActive: true }

export default function ContractTemplatesManager() {
  const [rows, setRows] = useState<Tpl[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/clinico/contract-templates', { cache: 'no-store' })
    setRows(r.ok ? await r.json() : [])
  }, [])

  useEffect(() => {
    load()
    fetch('/api/clinico/access').then((r) => (r.ok ? r.json() : {})).then((a: any) => setCanEdit(a?.contratos === 'edit')).catch(() => {})
  }, [load])

  function open(t?: Tpl) {
    setError(null)
    setEditing(t ? t.id : 'new')
    setForm(t ? { name: t.name, description: t.description ?? '', content: t.content, isActive: t.isActive } : EMPTY)
  }

  // Insere o campo onde o cursor está — escrever {{endereco_completo}} à mão é
  // pedir para errar uma letra e o campo sair em branco.
  function insertVar(key: string) {
    const el = textRef.current
    const tag = `{{${key}}}`
    if (!el) { setForm((f) => ({ ...f, content: f.content + tag })); return }
    const start = el.selectionStart ?? form.content.length
    const end = el.selectionEnd ?? start
    const next = form.content.slice(0, start) + tag + form.content.slice(end)
    setForm((f) => ({ ...f, content: next }))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length) })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    try {
      const isNew = editing === 'new'
      const r = await fetch(isNew ? '/api/clinico/contract-templates' : `/api/clinico/contract-templates/${editing}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.error || 'Não foi possível salvar.'); return }
      setEditing(null); load()
    } finally {
      setSaving(false)
    }
  }

  async function remove(t: Tpl) {
    if (!confirm(`Excluir o modelo "${t.name}"? Contratos já gerados não mudam.`)) return
    await fetch(`/api/clinico/contract-templates/${t.id}`, { method: 'DELETE' })
    load()
  }

  return (
    <SectionCard
      title="Modelos de contrato"
      description="Texto padrão da clínica. Os campos entre {{ }} são preenchidos com o cadastro do paciente."
      actions={canEdit && !editing && <ActionButton icon={<Plus />} onClick={() => open()}>Novo modelo</ActionButton>}
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nome *</label>
              <Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Descrição</label>
              <Input className="w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Texto do contrato *</label>
              <Textarea ref={textRef} className="w-full" rows={22} value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            </div>
            <aside className="space-y-3">
              <p className="text-xs text-muted-foreground">Clique para inserir no ponto do cursor:</p>
              {CONTRACT_VARIABLE_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="mb-1 text-xs font-semibold text-foreground">{g.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.keys.map((k) => (
                      <button key={k.key} type="button" title={k.hint} onClick={() => insertVar(k.key)}
                        className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-muted">
                        {k.key}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </aside>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
            Disponível para gerar contratos
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={() => setEditing(null)} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? 'Salvando…' : 'Salvar modelo'}
            </button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum modelo cadastrado.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                  {!t.isActive && <StatusBadge tone="neutral">Inativo</StatusBadge>}
                </div>
                {t.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => open(t)} title="Editar" aria-label={`Editar ${t.name}`} className="rounded-md p-2 text-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(t)} title="Excluir" aria-label={`Excluir ${t.name}`} className="rounded-md p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
