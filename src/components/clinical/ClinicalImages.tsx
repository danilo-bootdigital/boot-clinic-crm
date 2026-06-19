'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Upload, Trash2, FileText, ExternalLink } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { IMAGE_CATEGORIES, IMAGE_CATEGORY_LABELS, DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from '@/lib/validations/clinical'

const field = 'px-2 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export default function ClinicalImages({ patientId, canEdit = true }: { patientId: string; canEdit?: boolean }) {
  const [images, setImages] = useState<any[] | null>(null)
  const [docs, setDocs] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imgCat, setImgCat] = useState('BEFORE')
  const [docCat, setDocCat] = useState('EXAM')
  const [busy, setBusy] = useState(false)
  const imgInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [i, d] = await Promise.all([
      fetch(`/api/patients/${patientId}/images`, { cache: 'no-store' }),
      fetch(`/api/patients/${patientId}/documents`, { cache: 'no-store' }),
    ])
    setImages(i.ok ? await i.json() : [])
    setDocs(d.ok ? await d.json() : [])
  }, [patientId])

  useEffect(() => { load() }, [load])

  async function upload(kind: 'images' | 'documents', file: File, category: string) {
    setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('category', category)
    if (kind === 'documents') fd.append('title', file.name)
    const res = await fetch(`/api/patients/${patientId}/${kind}`, { method: 'POST', body: fd })
    setBusy(false)
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha no upload'); return }
    load()
  }

  async function removeImage(id: string) {
    if (!confirm('Remover esta imagem?')) return
    await fetch(`/api/clinico/images/${id}`, { method: 'DELETE' }); load()
  }
  async function removeDoc(id: string) {
    if (!confirm('Remover este documento?')) return
    await fetch(`/api/clinico/documents/${id}`, { method: 'DELETE' }); load()
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <SectionCard
        title="Imagens"
        description="Fotos clínicas, antes/depois e exames"
        actions={canEdit && (
          <div className="flex items-center gap-2">
            <select className={field} value={imgCat} onChange={(e) => setImgCat(e.target.value)}>
              {IMAGE_CATEGORIES.map((c) => <option key={c} value={c}>{IMAGE_CATEGORY_LABELS[c]}</option>)}
            </select>
            <button onClick={() => imgInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              <Upload className="h-4 w-4" /> {busy ? 'Enviando...' : 'Enviar imagem'}
            </button>
            <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('images', f, imgCat); e.target.value = '' }} />
          </div>
        )}
      >
        {images === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : images.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma imagem.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-lg border border-border">
                {img.url
                  ? <img src={img.url} alt={img.description || ''} className="h-32 w-full object-cover" />
                  : <div className="grid h-32 w-full place-items-center bg-muted text-muted-foreground"><FileText className="h-6 w-6" /></div>}
                <div className="flex items-center justify-between px-2 py-1 text-xs">
                  <span className="truncate text-muted-foreground">{IMAGE_CATEGORY_LABELS[img.category] || img.category}</span>
                  {canEdit && <button onClick={() => removeImage(img.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Documentos e anexos"
        description="Exames, laudos, termos e contratos"
        actions={canEdit && (
          <div className="flex items-center gap-2">
            <select className={field} value={docCat} onChange={(e) => setDocCat(e.target.value)}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</option>)}
            </select>
            <button onClick={() => docInput.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              <Upload className="h-4 w-4" /> {busy ? 'Enviando...' : 'Enviar documento'}
            </button>
            <input ref={docInput} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload('documents', f, docCat); e.target.value = '' }} />
          </div>
        )}
      >
        {docs === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : docs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum documento.</p>
        ) : (
          <div className="divide-y divide-border">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{DOCUMENT_CATEGORY_LABELS[d.category] || d.category} · {new Date(d.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="p-2 rounded-md text-primary hover:bg-accent"><ExternalLink className="h-4 w-4" /></a>}
                  {canEdit && <button onClick={() => removeDoc(d.id)} className="p-2 rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
