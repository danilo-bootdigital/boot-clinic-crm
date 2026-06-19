'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, ArrowLeft, Trash2, Send, CheckCircle2, XCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/components/ui/action-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { QUOTE_STATUS_LABELS } from '@/lib/validations/clinical'

const STATUS_TONE: Record<string, any> = { DRAFT: 'warning', SENT: 'info', APPROVED: 'success', REJECTED: 'destructive' }
const brl = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`

type Item = { description: string; quantity: number; unitPrice: number }

export default function Quotes({ patientId, canEdit = true }: { patientId: string; canEdit?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [discount, setDiscount] = useState('0')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unitPrice: 0 }])

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/quotes`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => { load() }, [load])

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0)
  const total = Math.max(0, subtotal - (Number(discount) || 0))

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const cleanItems = items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, quantity: Number(i.quantity) || 1, unitPrice: Number(i.unitPrice) || 0 }))
    const res = await fetch(`/api/patients/${patientId}/quotes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, discount: Number(discount) || 0, validUntil: validUntil || undefined, notes: notes || undefined, items: cleanItems, status: 'DRAFT' }),
    })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao criar orçamento'); return }
    setCreating(false); setTitle(''); setDiscount('0'); setValidUntil(''); setNotes(''); setItems([{ description: '', quantity: 1, unitPrice: 0 }]); load()
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/clinico/quotes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  return (
    <SectionCard
      title="Orçamentos"
      description="Orçamentos clínicos do paciente"
      actions={canEdit && (creating
        ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setCreating(false); setError(null) }}>Voltar</ActionButton>
        : <ActionButton icon={<Plus />} onClick={() => setCreating(true)}>Novo orçamento</ActionButton>)}
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {creating ? (
        <form onSubmit={create} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
            <Input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Itens / procedimentos</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input className="flex-1" placeholder="Descrição" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                  <Input type="number" min="1" className="w-20" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  <Input type="number" step="0.01" className="w-28" placeholder="Valor unit." value={it.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })} />
                  <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-2 rounded-md text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])} className="mt-2 text-sm text-primary hover:underline">+ Adicionar item</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-foreground mb-1">Desconto (R$)</label><Input type="number" step="0.01" className="w-full" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-foreground mb-1">Validade</label><Input type="date" className="w-full" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          </div>
          <div><label className="block text-sm font-medium text-foreground mb-1">Observações</label><Textarea className="w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>- {brl(Number(discount) || 0)}</span></div>
            <div className="flex justify-between font-semibold mt-1 border-t pt-1"><span>Total</span><span>{brl(total)}</span></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="submit" className="px-4 py-2 text-sm text-white bg-primary rounded-md hover:bg-primary/90">Salvar orçamento</button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum orçamento criado.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((q) => (
            <div key={q.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{q.title}</span>
                    <StatusBadge tone={STATUS_TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status] || q.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{q.items?.length || 0} item(ns) · Total {brl(q.total)}{q.validUntil ? ` · válido até ${new Date(q.validUntil).toLocaleDateString('pt-BR')}` : ''}</p>
                </div>
                {canEdit && q.status !== 'REJECTED' && q.status !== 'APPROVED' && (
                  <div className="flex shrink-0 gap-1">
                    {q.status === 'DRAFT' && <button onClick={() => setStatus(q.id, 'SENT')} title="Enviar" className="p-2 rounded-md text-primary hover:bg-accent"><Send className="h-4 w-4" /></button>}
                    <button onClick={() => setStatus(q.id, 'APPROVED')} title="Aprovar" className="p-2 rounded-md text-success hover:bg-success/10"><CheckCircle2 className="h-4 w-4" /></button>
                    <button onClick={() => setStatus(q.id, 'REJECTED')} title="Recusar" className="p-2 rounded-md text-destructive hover:bg-destructive/10"><XCircle className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              {q.items?.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {q.items.map((it: any) => (
                    <li key={it.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{it.quantity}× {it.description}</span><span>{brl(it.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
