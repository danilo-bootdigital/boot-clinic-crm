'use client'

import { useCallback, useEffect, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterSelect } from '@/components/ui/filter-bar'
import { Check, Field, StockTabs, apiSend, useRole } from '@/components/stock/shared'
import { LOCATION_TYPE_LABELS, STORAGE_TEMP_LABELS, stockCan } from '@/lib/stock-caps'

type Location = { id: string; name: string; type: string; roomId: string | null; storageTemp: string; isDefault: boolean; controlledStorage: boolean; isActive: boolean; balanceCount: number }
type Category = { id: string; name: string; isActive: boolean; order: number; itemCount: number }
type Settings = { defaultConsumptionMode: string; expiryAlertDays: number; overconsumptionAlertPct: number }

const emptyLoc = { name: '', type: 'ALMOXARIFADO', roomId: '', storageTemp: 'AMBIENTE', isDefault: false, controlledStorage: false }

export default function EstoqueConfiguracoesPage() {
  const role = useRole()
  const canManage = stockCan(role, 'manage')
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [locEdit, setLocEdit] = useState<string | null>(null) // id | 'new'
  const [locForm, setLocForm] = useState(emptyLoc)
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/estoque/locations').then((r) => r.json()).then((d) => setLocations(Array.isArray(d) ? d : []))
    fetch('/api/estoque/categories').then((r) => r.json()).then((d) => setCategories(Array.isArray(d) ? d : []))
    fetch('/api/estoque/settings').then((r) => r.json()).then((d) => d?.id && setSettings(d))
    fetch('/api/estoque/lookups').then((r) => r.json()).then((d) => setRooms(d?.rooms ?? []))
  }, [])
  useEffect(() => { load() }, [load])

  async function run(p: Promise<{ ok: boolean; data: any }>, okMsg: string) {
    setError(null); setSaved(null)
    const res = await p
    if (!res.ok) { setError(res.data?.error || 'Erro ao salvar'); return false }
    setSaved(okMsg); load(); return true
  }

  async function saveLocation() {
    if (!locForm.name.trim()) return setError('Informe o nome do local')
    const body = { ...locForm, roomId: locForm.type === 'SALA' ? locForm.roomId || null : null }
    const ok = await run(
      locEdit === 'new' ? apiSend('/api/estoque/locations', 'POST', body) : apiSend(`/api/estoque/locations/${locEdit}`, 'PATCH', body),
      'Local salvo.',
    )
    if (ok) setLocEdit(null)
  }

  async function saveSettings(patch: Partial<Settings>) {
    await run(apiSend('/api/estoque/settings', 'PATCH', patch), 'Configuração salva.')
  }

  if (role && !canManage) return (
    <div>
      <PageHeader title="Estoque" description="Configurações" icon={<Package className="h-5 w-5" />} />
      <StockTabs role={role} />
      <EmptyState title="Sem acesso" description="As configurações do estoque são da gestão." />
    </div>
  )

  return (
    <div>
      <PageHeader title="Estoque" description="Configurações" icon={<Package className="h-5 w-5" />} />
      <StockTabs role={role} />

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="mb-4 text-sm text-muted-foreground">{saved}</p>}

      <section className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Locais</h3>
            <p className="text-sm text-muted-foreground">Onde os itens ficam. O local padrão recebe as entradas.</p>
          </div>
          {locEdit === null && <Button size="sm" onClick={() => { setLocEdit('new'); setLocForm(emptyLoc) }}><Plus className="mr-1 h-4 w-4" />Novo local</Button>}
        </div>

        {locEdit !== null && (
          <div className="mb-4 rounded-lg border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" required><Input value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} placeholder="Ex.: Geladeira 1" /></Field>
              <Field label="Tipo">
                <FilterSelect className="w-full" value={locForm.type} onChange={(e) => setLocForm({ ...locForm, type: e.target.value })}>
                  {Object.entries(LOCATION_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </FilterSelect>
              </Field>
              {locForm.type === 'SALA' && (
                <Field label="Sala da agenda" hint="A baixa no atendimento usa o local da sala (Fase 3).">
                  <FilterSelect className="w-full" value={locForm.roomId} onChange={(e) => setLocForm({ ...locForm, roomId: e.target.value })}>
                    <option value="">—</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </FilterSelect>
                </Field>
              )}
              <Field label="Temperatura">
                <FilterSelect className="w-full" value={locForm.storageTemp} onChange={(e) => setLocForm({ ...locForm, storageTemp: e.target.value })}>
                  {Object.entries(STORAGE_TEMP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </FilterSelect>
              </Field>
            </div>
            <div className="mt-3">
              <Check checked={locForm.isDefault} onChange={(v) => setLocForm({ ...locForm, isDefault: v })}>Local padrão das entradas</Check>
              <Check checked={locForm.controlledStorage} onChange={(v) => setLocForm({ ...locForm, controlledStorage: v })}>Guarda de controlados (armário/local trancado)</Check>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={saveLocation}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => setLocEdit(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-border">
          {locations.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {l.name}
                  {l.isDefault && <StatusBadge tone="info">padrão</StatusBadge>}
                  {l.controlledStorage && <StatusBadge tone="destructive" dot={false}>controlados</StatusBadge>}
                  {!l.isActive && <StatusBadge tone="neutral">inativo</StatusBadge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {LOCATION_TYPE_LABELS[l.type]} · {STORAGE_TEMP_LABELS[l.storageTemp]}
                  {l.roomId && rooms.find((r) => r.id === l.roomId) ? ` · ${rooms.find((r) => r.id === l.roomId)!.name}` : ''}
                  {` · ${l.balanceCount} saldo(s)`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => {
                  setLocEdit(l.id)
                  setLocForm({ name: l.name, type: l.type, roomId: l.roomId || '', storageTemp: l.storageTemp, isDefault: l.isDefault, controlledStorage: l.controlledStorage })
                }}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => run(apiSend(`/api/estoque/locations/${l.id}`, 'PATCH', { isActive: !l.isActive }), l.isActive ? 'Local desativado.' : 'Local ativado.')}>
                  {l.isActive ? 'Desativar' : 'Ativar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Excluir o local "${l.name}"?`) && run(apiSend(`/api/estoque/locations/${l.id}`, 'DELETE'), 'Local excluído.')}>Excluir</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="text-base font-semibold">Categorias</h3>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault()
          if (!newCat.trim()) return
          if (await run(apiSend('/api/estoque/categories', 'POST', { name: newCat.trim(), order: categories.length }), 'Categoria criada.')) setNewCat('')
        }}>
          <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria" className="max-w-xs" aria-label="Nova categoria" />
          <Button size="sm" type="submit" className="h-10">Adicionar</Button>
        </form>
        <ul className="mt-3 divide-y divide-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-sm">
                {c.name} <span className="text-xs text-muted-foreground">· {c.itemCount} item(ns)</span>
                {!c.isActive && <StatusBadge tone="neutral" className="ml-2">inativa</StatusBadge>}
              </p>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => {
                  const name = window.prompt('Novo nome da categoria:', c.name)
                  if (name && name.trim() && name.trim() !== c.name) run(apiSend(`/api/estoque/categories/${c.id}`, 'PATCH', { name: name.trim() }), 'Categoria renomeada.')
                }}>Renomear</Button>
                <Button size="sm" variant="ghost" onClick={() => run(apiSend(`/api/estoque/categories/${c.id}`, 'PATCH', { isActive: !c.isActive }), 'Categoria atualizada.')}>
                  {c.isActive ? 'Desativar' : 'Ativar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Excluir a categoria "${c.name}"?`) && run(apiSend(`/api/estoque/categories/${c.id}`, 'DELETE'), 'Categoria excluída.')}>Excluir</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {settings && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="text-base font-semibold">Parâmetros</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Baixa no atendimento (padrão da clínica)" hint="Cada ficha técnica pode sobrescrever. Controlados nunca saem sozinhos. Entra em uso na Fase 3.">
              <FilterSelect className="w-full" value={settings.defaultConsumptionMode} onChange={(e) => saveSettings({ defaultConsumptionMode: e.target.value })}>
                <option value="CONFIRMADA">Confirmada — alguém confere os materiais</option>
                <option value="AUTOMATICA">Automática — baixa o kit ao marcar realizado</option>
              </FilterSelect>
            </Field>
            <Field label="Alerta de validade (dias de antecedência)">
              <Input type="number" min={1} max={365} defaultValue={settings.expiryAlertDays}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v !== settings.expiryAlertDays) saveSettings({ expiryAlertDays: v }) }} />
            </Field>
          </div>
        </section>
      )}
    </div>
  )
}
