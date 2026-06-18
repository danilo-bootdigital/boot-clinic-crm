'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brl } from '@/lib/financial-format'

interface Named { id: string; name: string }

// Formulário inline para lançar uma despesa (conta a pagar). Valor é informado
// pelo usuário (despesa não tem origem como o recebível). Fornecedor/categoria/
// centro de custo são opcionais e validados no servidor (mesma empresa).
export function NewPayableForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [suppliers, setSuppliers] = useState<Named[]>([])
  const [categories, setCategories] = useState<Named[]>([])
  const [costCenters, setCostCenters] = useState<Named[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newSupplier, setNewSupplier] = useState('')

  const reload = () =>
    Promise.all([
      fetch('/api/financeiro/suppliers').then((r) => r.json()),
      fetch('/api/financeiro/expense-categories').then((r) => r.json()),
      fetch('/api/financeiro/cost-centers').then((r) => r.json()),
    ]).then(([s, c, cc]) => {
      setSuppliers(Array.isArray(s) ? s : [])
      setCategories(Array.isArray(c) ? c : [])
      setCostCenters(Array.isArray(cc) ? cc : [])
    })

  useEffect(() => { reload().catch(() => setError('Falha ao carregar catálogos')).finally(() => setLoading(false)) }, [])

  async function createSupplier() {
    if (!newSupplier.trim()) return
    const res = await fetch('/api/financeiro/suppliers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSupplier.trim() }),
    })
    if (res.ok) { const s = await res.json(); setNewSupplier(''); await reload(); setSupplierId(s.id) }
    else { const j = await res.json().catch(() => ({})); setError(j.error || 'Erro ao criar fornecedor') }
  }

  const finalAmount = Math.max(0, amount - discount)
  const valid = amount > 0 && discount <= amount && !!description.trim()

  async function submit() {
    if (!valid) { setError('Informe descrição e valor válido'); return }
    setSubmitting(true); setError(null)
    const res = await fetch('/api/financeiro/payables', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: supplierId || undefined, categoryId: categoryId || undefined, costCenterId: costCenterId || undefined,
        description, originalAmount: amount, discountAmount: discount, dueDate,
      }),
    })
    setSubmitting(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Erro ao criar despesa'); return }
    onCreated()
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Carregando…</div>

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
      <h3 className="text-base font-semibold">Nova despesa</h3>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">Fornecedor</span>
          <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— sem fornecedor —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Categoria</span>
          <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— sem categoria —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Centro de custo</span>
          <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            <option value="">— sem centro —</option>
            {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">Novo fornecedor (rápido)</span>
          <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Nome do fornecedor" />
        </label>
        <Button variant="outline" onClick={createSupplier} disabled={!newSupplier.trim()}>Adicionar</Button>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Descrição</span>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel maio" />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">Valor (R$)</span>
          <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Desconto (R$)</span>
          <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Vencimento</span>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">Valor final: <strong className="text-foreground">{brl(finalAmount)}</strong></p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={submitting || !valid}>{submitting ? 'Salvando…' : 'Criar despesa'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
