'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TimelineProps {
  patientId: string
}

interface Event {
  id: string
  title: string
  content: string
  type: string
  createdAt: string
  user?: { name: string } | null
}

const TYPE_LABELS: Record<string, string> = {
  NOTE: 'Anotação', APPOINTMENT: 'Consulta', PHONE_CALL: 'Ligação', EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp', DOCUMENT: 'Documento', STATUS_CHANGE: 'Alteração',
}

export default function Timeline({ patientId }: TimelineProps) {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/timeline`, { cache: 'no-store' })
    if (res.ok) setEvents(await res.json())
    else setEvents([])
  }, [patientId])

  useEffect(() => { load() }, [load])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true); setErr(null)
    const res = await fetch(`/api/patients/${patientId}/timeline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: 'NOTE' }),
    })
    setSaving(false)
    if (res.ok) { setContent(''); load() }
    else { const e = await res.json().catch(() => ({})); setErr(e.error || 'Falha ao adicionar anotação') }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linha do Tempo</CardTitle>
        <CardDescription>Histórico de interações e eventos</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={addNote} className="mb-4 flex gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Adicionar anotação..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : 'Adicionar'}
          </button>
        </form>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

        {events === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento registrado</p>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="border-l-2 border-blue-200 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{ev.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString('pt-BR')}</span>
                </div>
                <p className="text-sm text-muted-foreground">{ev.content}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                  {TYPE_LABELS[ev.type] || ev.type}{ev.user?.name ? ` · ${ev.user.name}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
