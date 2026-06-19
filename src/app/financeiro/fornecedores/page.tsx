'use client'

import { useCallback, useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { payableCan } from '@/lib/financial-caps'

type Supplier = { id: string; name: string; document: string | null; email: string | null; phone: string | null; notes: string | null; isActive: boolean }
type Form = { name: string; document: string; email: string; phone: string; notes: string; isActive: boolean }

const empty: Form = { name: '', document: '', email: '', phone: '', notes: '', isActive: true }

// Cadastro mestre de Fornecedores: criar, editar, ativar/desativar e excluir
// (excluir bloqueado se houver despesas vinculadas). Não altera valores de
// despesas já lançadas — apenas o cadastro.
export default function FornecedoresPage() {
  const [role, setRole] = useState('')
  const [items, setItems] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null) // id em edição, ou 'new'
  const [form, setForm] = useState<Form>(empty)
  const canManage = payableCan(role, 'create')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/financeiro/suppliers')
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Falha ao carregar'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((m) => setRole(m?.role || '')) }, [])
  useEffect(() => { load() }, [load])

  function openNew() { setEditId('new'); setForm(empty); setError(null) }
  function openEdit(s: Supplier) {
    setEditId(s.id)
    setForm({ name: s.name, document: s.document || '', email: s.email || '', phone: s.phone || '', notes: s.notes || '', isActive: s.isActive })
    setError(null)
  }

  async function save() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    const isNew = editId === 'new'
    const res = await fetch(isNew ? '/api/financeiro/suppliers' : `/api/financeiro/suppliers/${editId}`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Erro ao salvar'); return }
    setEditId(null); load()
  }
  async function toggle(s: Supplier) {
    const res = await fetch(`/api/financeiro/suppliers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !s.isActive }) })
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Erro'); else load()
  }
  async function remove(s: Supplier) {
    if (!window.confirm(`Excluir o fornecedor "${s.name}"?`)) return
    const res = await fetch(`/api/financeiro/suppliers/${s.id}`, { method: 'DELETE' })
    if (!res.ok) setError((await res.json().catch(() => ({}))).error || 'Erro'); else load()
  }

  const fieldCls = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Fornecedores" icon={<Truck className="h-5 w-5" />}
        actions={canManage && editId === null ? <Button size="sm" onClick={openNew}>+ Novo fornecedor</Button> : undefined} />
      <FinanceTabs role={role} />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {editId !== null && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 text-base font-semibold">{editId === 'new' ? 'Novo fornecedor' : 'Editar fornecedor'}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-sm font-medium">Nome *</span>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-sm font-medium">CNPJ/CPF</span>
              <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-sm font-medium">E-mail</span>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-sm font-medium">Telefone</span>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-sm font-medium">Observações</span>
              <textarea className={fieldCls + ' h-20 py-2'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Ativo
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={save}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {s.name}
                    {!s.isActive && <StatusBadge tone="neutral">inativo</StatusBadge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.document, s.email, s.phone].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(s)}>{s.isActive ? 'Desativar' : 'Ativar'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)}>Excluir</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
