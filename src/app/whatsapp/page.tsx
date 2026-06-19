'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Plus, ArrowLeft } from 'lucide-react'
import WhatsAppCentral from '@/components/whatsapp/WhatsAppCentral'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { ActionButton } from '@/components/ui/action-button'

export default function WhatsAppPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'central' | 'new'>('central')
  const [form, setForm] = useState({ contactName: '', contactPhone: '' })
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  const [evolution, setEvolution] = useState<boolean | null>(null)

  useEffect(() => {
    // Verifica acesso e estado da integração.
    fetch('/api/whatsapp/conversations').then((r) => {
      if (r.status === 401) router.push('/login?redirect=/whatsapp')
    })
    fetch('/api/whatsapp/status').then((r) => (r.ok ? r.json() : null)).then((d) => setEvolution(d?.configured ?? false)).catch(() => setEvolution(false))
  }, [router])

  async function createConversation(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/whatsapp/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Falha ao criar conversa'); return }
    setForm({ contactName: '', contactPhone: '' })
    setMode('central'); setKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp"
        description="Central de conversas e atendimento"
        icon={<MessageCircle className="h-5 w-5" />}
        actions={mode === 'central'
          ? <ActionButton icon={<Plus />} onClick={() => setMode('new')}>Nova conversa</ActionButton>
          : <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setMode('central'); setError(null) }}>Voltar</ActionButton>}
      />

      {evolution === false && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          Integração com a Evolution API não configurada — as mensagens enviadas ficam <strong>pendentes</strong> até conectar um número.
          Configure <code>WHATSAPP_API_URL</code>, <code>WHATSAPP_API_KEY</code> e <code>WHATSAPP_INSTANCE</code> no servidor.
        </div>
      )}

      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {mode === 'new' ? (
        <SectionCard title="Nova conversa">
          <form onSubmit={createConversation} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nome do contato *</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-sm" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Telefone (com DDD) *</label>
              <input className="w-full px-3 py-2 border border-border rounded-md text-sm" placeholder="(11) 99999-9999" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} required />
            </div>
            <button type="submit" className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90">Criar conversa</button>
          </form>
        </SectionCard>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <WhatsAppCentral key={key} />
        </div>
      )}
    </div>
  )
}
