'use client'

import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TagsProps {
  patientId: string
}

interface Tag {
  id: string
  name: string
  color?: string | null
}

export default function Tags({ patientId }: TagsProps) {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/tags`, { cache: 'no-store' })
    setTags(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => { load() }, [load])

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr(null)
    const res = await fetch(`/api/patients/${patientId}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setSaving(false)
    if (res.ok) { setName(''); load() }
    else { const e = await res.json().catch(() => ({})); setErr(e.error || 'Falha ao adicionar tag') }
  }

  async function removeTag(tagId: string) {
    const res = await fetch(`/api/patients/${patientId}/tags/${tagId}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>Categorias e classificações</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={addTag} className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova tag (ex.: VIP)"
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? '...' : 'Adicionar'}
          </button>
        </form>
        {err && <p className="mb-2 text-sm text-destructive">{err}</p>}

        {tags === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tag atribuída</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white"
                style={{ backgroundColor: t.color || '#3B82F6' }}>
                {t.name}
                <button onClick={() => removeTag(t.id)} className="ml-0.5 rounded-full hover:bg-white/20" aria-label="Remover tag">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
