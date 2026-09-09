'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Plus, ArrowLeft, Pencil, Power, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const emptyForm = { title: '', content: '', keyword: '' }

/** Slug simples (sem acento, só a-z0-9) — usado para sugerir a palavra-chave a partir do título. */
// Faixa Unicode "Combining Diacritical Marks" (0x0300-0x036f), construída por
// código para não depender de digitar caracteres combinantes no fonte.
const DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').replace(/[^a-z0-9]+/g, '')
}

export default function QuickRepliesPage() {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  // Enquanto o usuário não mexe na palavra-chave à mão, ela segue o título —
  // para de acompanhar assim que ele a edita (não sobrescreve o que já escolheu).
  const [keywordTouched, setKeywordTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/mensageria/quick-replies?all=1', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/mensageria/mensagens-prontas'); return }
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function abrirNova() {
    setForm(emptyForm)
    setEditingId(null)
    setKeywordTouched(false)
    setError(null)
    setCreating(true)
  }

  function abrirEdicao(item: any) {
    setForm({ title: item.title, content: item.content, keyword: item.keyword || '' })
    setEditingId(item.id)
    setKeywordTouched(true) // já tem palavra-chave própria — título não deve mais sobrescrever
    setError(null)
    setCreating(true)
  }

  function onTitleChange(title: string) {
    setForm((f) => ({ ...f, title, keyword: keywordTouched ? f.keyword : slug(title) }))
  }

  function onKeywordChange(keyword: string) {
    setKeywordTouched(true)
    setForm((f) => ({ ...f, keyword }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = editingId
      ? await fetch(`/api/mensageria/quick-replies/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      : await fetch('/api/mensageria/quick-replies', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
    setBusy(false)
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar mensagem'); return }
    setCreating(false)
    setEditingId(null)
    load()
  }

  async function toggleActive(item: any) {
    await fetch(`/api/mensageria/quick-replies/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !item.isActive }),
    })
    load()
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta mensagem pronta?')) return
    await fetch(`/api/mensageria/quick-replies/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensagens Prontas"
        description="Respostas rápidas oferecidas no campo de envio da mensageria"
        icon={<MessageSquare className="h-5 w-5" />}
        actions={
          creating
            ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setEditingId(null); setError(null) }}>Voltar</ActionButton>
            : <ActionButton icon={<Plus />} onClick={abrirNova}>Nova mensagem</ActionButton>
        }
      />

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {creating ? (
        <SectionCard title={editingId ? 'Editar mensagem' : 'Nova mensagem'}>
          <form onSubmit={salvar} className="max-w-2xl space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Título *</label>
              <p className="mb-1 text-xs text-muted-foreground">Só para identificar na lista — não aparece mais na conversa.</p>
              <Input className="w-full" value={form.title} onChange={(e) => onTitleChange(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Palavra-chave *</label>
              <p className="mb-1 text-xs text-muted-foreground">
                Digite <code className="rounded bg-muted px-1 py-0.5">/{form.keyword || 'palavra'}</code> no
                campo de envio da conversa para inserir esta mensagem. Só letras, números, - e _.
              </p>
              <Input
                className="w-full font-mono"
                value={form.keyword}
                onChange={(e) => onKeywordChange(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Mensagem *</label>
              <p className="mb-1 text-xs text-muted-foreground">O texto exato que entra no campo de envio ao clicar no botão.</p>
              <Textarea className="w-full" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            </div>
            <div className="flex justify-end gap-3 border-t pt-2">
              <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60">
                {busy ? 'Salvando…' : 'Salvar mensagem'}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : loading ? (
        <LoadingState rows={5} label="Carregando mensagens" />
      ) : items.length === 0 ? (
        <SectionCard><p className="text-sm text-muted-foreground">Nenhuma mensagem pronta cadastrada. Crie a primeira em &quot;Nova mensagem&quot;.</p></SectionCard>
      ) : (
        <SectionCard>
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                    {item.keyword && (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">/{item.keyword}</code>
                    )}
                    <StatusBadge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'Ativa' : 'Inativa'}</StatusBadge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => abrirEdicao(item)} title="Editar" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => toggleActive(item)} title={item.isActive ? 'Desativar' : 'Ativar'} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Power className="h-4 w-4" /></button>
                  <button onClick={() => remove(item.id)} title="Excluir" className="rounded-md p-2 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
