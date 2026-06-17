'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Trash2, Download, Upload } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AttachmentsProps {
  patientId: string
}

interface Attachment {
  id: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  url: string | null
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function Attachments({ patientId }: AttachmentsProps) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/attachments`, { cache: 'no-store' })
    setItems(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => { load() }, [load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/patients/${patientId}/attachments`, { method: 'POST', body: fd })
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (res.ok) load()
    else { const e = await res.json().catch(() => ({})); setErr(e.error || 'Falha no upload') }
  }

  async function remove(id: string) {
    if (!confirm('Remover este anexo?')) return
    const res = await fetch(`/api/patients/${patientId}/attachments/${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anexos</CardTitle>
        <CardDescription>Documentos e arquivos do paciente (até 10 MB)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <input ref={inputRef} type="file" onChange={onFile} className="hidden" id="att-input" />
          <label htmlFor="att-input" className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Upload className="h-4 w-4" /> {uploading ? 'Enviando...' : 'Enviar arquivo'}
          </label>
        </div>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

        {items === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum anexo encontrado</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{a.originalName}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(a.size)} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Baixar">
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <button onClick={() => remove(a.id)} className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10" aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
