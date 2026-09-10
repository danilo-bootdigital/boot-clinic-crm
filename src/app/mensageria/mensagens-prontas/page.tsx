'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Plus, ArrowLeft, Pencil, Power, Trash2, Paperclip, FileText, X, ChevronUp, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatBytes } from '@/lib/messaging/media-client'

const emptyForm = { title: '', content: '', keyword: '' }

// Escopo próprio (mais estreito que o anexo de conversa, que aceita mais
// formatos): mensagem pronta só permite imagem ou PDF — o mesmo allowlist do
// endpoint /api/mensageria/quick-replies/attachment.
const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ATTACHMENT_LIMITS: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024, 'image/png': 10 * 1024 * 1024, 'image/webp': 10 * 1024 * 1024,
  'application/pdf': 20 * 1024 * 1024,
}
function validateAttachment(file: File): string | null {
  const max = ATTACHMENT_LIMITS[file.type]
  if (!max) return 'Só imagem (JPG/PNG/WEBP) ou PDF é permitido.'
  if (file.size > max) return `Arquivo excede ${Math.round(max / (1024 * 1024))} MB.`
  return null
}

/** Um item da lista de anexos: `id` presente = já salvo; `file` presente = upload pendente. */
interface ImageItem {
  key: string
  id?: string
  file?: File
  previewUrl?: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
  caption: string
}

function newKey() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

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

  // Imagens/PDF: upload fica pendente até "Salvar mensagem" — evita arquivo
  // órfão no storage se o usuário escolher anexos e cancelar sem salvar.
  const [images, setImages] = useState<ImageItem[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/mensageria/quick-replies?all=1', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/mensageria/mensagens-prontas'); return }
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  function limparImagens() {
    images.forEach((img) => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl) })
    setImages([])
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function abrirNova() {
    setForm(emptyForm)
    setEditingId(null)
    setKeywordTouched(false)
    setError(null)
    limparImagens()
    setCreating(true)
  }

  function abrirEdicao(item: any) {
    setForm({ title: item.title, content: item.content || '', keyword: item.keyword || '' })
    setEditingId(item.id)
    setKeywordTouched(true) // já tem palavra-chave própria — título não deve mais sobrescrever
    setError(null)
    setAttachmentError(null)
    setImages(
      (item.attachments || []).map((a: any) => ({
        key: a.id, id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes || 0, caption: a.caption || '',
      }))
    )
    setCreating(true)
  }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    setAttachmentError(null)
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = '' // permite escolher o mesmo arquivo de novo depois
    if (!files.length) return
    const novas: ImageItem[] = []
    for (const f of files) {
      const erro = validateAttachment(f)
      if (erro) { setAttachmentError(`${f.name}: ${erro}`); continue }
      novas.push({
        key: newKey(), file: f, previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        fileName: f.name, mimeType: f.type, sizeBytes: f.size, caption: '',
      })
    }
    if (novas.length) setImages((prev) => [...prev, ...novas])
  }

  function removeImage(key: string) {
    setImages((prev) => {
      const alvo = prev.find((i) => i.key === key)
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl)
      return prev.filter((i) => i.key !== key)
    })
  }

  function moveImage(key: string, dir: -1 | 1) {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.key === key)
      const alvo = idx + dir
      if (idx < 0 || alvo < 0 || alvo >= prev.length) return prev
      const copia = [...prev]
      const tmp = copia[idx]; copia[idx] = copia[alvo]; copia[alvo] = tmp
      return copia
    })
  }

  function setCaption(key: string, caption: string) {
    setImages((prev) => prev.map((i) => (i.key === key ? { ...i, caption } : i)))
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

    if (!form.content.trim() && images.length === 0) {
      setError('Preencha o texto ou anexe ao menos uma imagem/PDF.')
      return
    }

    setBusy(true)
    try {
      // Sobe só o que ainda não foi salvo (item.file); o que já existia (item.id) só muda legenda/ordem.
      const attachments: Record<string, unknown>[] = []
      for (const img of images) {
        if (img.id) {
          attachments.push({ id: img.id, caption: img.caption })
          continue
        }
        const fd = new FormData()
        fd.append('file', img.file!)
        const up = await fetch('/api/mensageria/quick-replies/attachment', { method: 'POST', body: fd })
        const upBody = await up.json().catch(() => ({}))
        if (!up.ok) { setError(`Falha ao enviar ${img.fileName}: ${upBody.error || 'erro desconhecido'}`); return }
        attachments.push({ ...upBody, caption: img.caption })
      }

      const res = editingId
        ? await fetch(`/api/mensageria/quick-replies/${editingId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, attachments }),
          })
        : await fetch('/api/mensageria/quick-replies', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, attachments }),
          })
      if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao salvar mensagem'); return }
      setCreating(false)
      setEditingId(null)
      load()
    } finally {
      setBusy(false)
    }
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
              <label className="mb-1 block text-sm font-medium text-foreground">Mensagem</label>
              <p className="mb-1 text-xs text-muted-foreground">Texto solto, enviado separado das imagens. Ao menos um dos dois (texto ou imagem) é obrigatório.</p>
              <Textarea className="w-full" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Imagens / PDF (opcional)</label>
              <p className="mb-1 text-xs text-muted-foreground">Cada uma é enviada como uma mensagem separada, na ordem abaixo, com a legenda que você definir.</p>

              <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} multiple className="hidden" onChange={onPickImages} />

              <div className="space-y-2">
                {images.map((img, idx) => (
                  <div key={img.key} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    {img.previewUrl ? (
                      <img src={img.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{img.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(img.sizeBytes)}</p>
                      <Input
                        className="w-full text-sm"
                        placeholder="Legenda desta imagem (opcional)"
                        value={img.caption}
                        onChange={(e) => setCaption(img.key, e.target.value)}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button type="button" onClick={() => moveImage(img.key, -1)} disabled={idx === 0} title="Mover para cima" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveImage(img.key, 1)} disabled={idx === images.length - 1} title="Mover para baixo" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button type="button" onClick={() => removeImage(img.key)} title="Remover" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" /> {images.length ? 'Adicionar outra imagem' : 'Adicionar imagem'}
              </button>
              {attachmentError && <p className="mt-1 text-sm text-destructive">{attachmentError}</p>}
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
                  {item.content && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>}
                  {item.attachments?.length > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      {item.attachments.length === 1 ? item.attachments[0].fileName : `${item.attachments.length} imagens/arquivos`}
                    </p>
                  )}
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
