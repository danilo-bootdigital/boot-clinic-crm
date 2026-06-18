'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'

interface Item { id: string; name: string; isActive: boolean; isDefault: boolean; order: number }

// Gestor genérico de catálogo (categorias de receita/despesa). `endpoint` é a
// base REST: GET/POST em `endpoint`, PATCH/DELETE em `endpoint/[id]`.
export function CategoryManager({ title, endpoint, canManage }: { title: string; endpoint: string; canManage: boolean }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [novo, setNovo] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = () =>
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setError('Falha ao carregar'))
      .finally(() => setLoading(false))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function call(method: string, path: string, body?: any) {
    setError(null)
    const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Erro'); return false }
    return true
  }

  async function add() {
    if (!novo.trim()) return
    if (await call('POST', endpoint, { name: novo.trim() })) { setNovo(''); load() }
  }
  async function rename(id: string) {
    if (!editName.trim()) return
    if (await call('PATCH', `${endpoint}/${id}`, { name: editName.trim() })) { setEditId(null); load() }
  }
  async function toggle(it: Item) { if (await call('PATCH', `${endpoint}/${it.id}`, { isActive: !it.isActive })) load() }
  async function remove(id: string) {
    if (!window.confirm('Excluir esta categoria?')) return
    if (await call('DELETE', `${endpoint}/${id}`)) load()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-2 py-2">
              {editId === it.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  <Button size="sm" variant="ghost" onClick={() => rename(it.id)}><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-sm">
                    {it.name}
                    {!it.isActive && <StatusBadge tone="neutral">inativa</StatusBadge>}
                    {it.isDefault && <span className="text-xs text-muted-foreground">(padrão)</span>}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(it.id); setEditName(it.name) }} title="Renomear"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(it)} title={it.isActive ? 'Desativar' : 'Ativar'}>
                        {it.isActive ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(it.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nenhuma categoria.</li>}
        </ul>
      )}

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nova categoria" className="h-9" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button size="sm" onClick={add} disabled={!novo.trim()}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
