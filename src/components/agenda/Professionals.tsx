'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Stethoscope, Check, X, Link2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Professional {
  id: string
  name: string
  crm?: string | null
  phone?: string | null
  email?: string | null
  userId?: string | null
  isActive: boolean
}

const EMPTY = { name: '', crm: '', phone: '', email: '' }

export function Professionals() {
  const [items, setItems] = useState<Professional[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/professionals', { cache: 'no-store' })
      if (res.ok) setItems(await res.json())
    } catch (e) {
      console.error('Erro ao listar profissionais:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setError(null); setShowForm(true) }
  const openEdit = (p: Professional) => {
    setEditingId(p.id)
    setForm({ name: p.name, crm: p.crm || '', phone: p.phone || '', email: p.email || '' })
    setError(null)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `/api/professionals/${editingId}` : '/api/professionals'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          crm: form.crm || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setForm(EMPTY)
        setEditingId(null)
        fetchItems()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Não foi possível salvar')
      }
    } catch {
      setError('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Professional) => {
    await fetch(`/api/professionals/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    fetchItems()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este profissional?')) return
    const res = await fetch(`/api/professionals/${id}`, { method: 'DELETE' })
    if (res.ok) fetchItems()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Profissionais</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Profissionais ({items.length})
          </CardTitle>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg bg-muted">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Nome*</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dra. Maria Silva" required />
                </div>
                <div>
                  <label className="text-sm font-medium">CRM / Registro</label>
                  <Input value={form.crm} onChange={(e) => setForm({ ...form, crm: e.target.value })} placeholder="CRM 123456" />
                </div>
                <div>
                  <label className="text-sm font-medium">Telefone</label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="text-sm font-medium">E-mail</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@clinica.com" />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex space-x-2">
                <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">Nenhum profissional cadastrado</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((p) => (
              <div key={p.id} className="p-4 border rounded-lg hover:bg-muted">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{p.name}</h3>
                      {p.userId && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
                          <Link2 className="h-3 w-3" /> Conta de acesso
                        </Badge>
                      )}
                    </div>
                    {p.crm && <p className="text-sm text-muted-foreground mt-1">{p.crm}</p>}
                    {(p.phone || p.email) && (
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{[p.phone, p.email].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 ml-4">
                    <Badge variant="secondary" className={p.isActive ? 'bg-success/15 text-success' : 'bg-muted text-foreground'}>
                      {p.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                    {p.isActive ? <><X className="h-4 w-4 mr-1" />Desativar</> : <><Check className="h-4 w-4 mr-1" />Ativar</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
