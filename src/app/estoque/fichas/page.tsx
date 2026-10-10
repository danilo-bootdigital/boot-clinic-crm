'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterSelect } from '@/components/ui/filter-bar'
import { Check, ControlledBadge, Field, StockTabs, apiSend, fmtQty, useRole } from '@/components/stock/shared'
import { stockCan } from '@/lib/stock-caps'
import { brl } from '@/lib/financial-format'
import { APPOINTMENT_TYPES } from '@/components/agenda/AppointmentForm'

type KitItem = { itemId: string; quantity: number; variable: boolean; optional: boolean; name: string; baseUnit: string; isControlled: boolean; controlledList: string | null; itemActive: boolean }
type Kit = { id: string; name: string; appointmentType: string | null; consumptionMode: string | null; notes: string | null; isActive: boolean; estimatedCost?: number; items: KitItem[] }
type Line = { key: string; itemId: string; quantity: string; variable: boolean; optional: boolean }

const MODE_LABEL: Record<string, string> = { AUTOMATICA: 'Automática', CONFIRMADA: 'Confirmada' }

// Fichas técnicas: materiais consumidos por tipo de atendimento (§8 item 7).
export default function FichasTecnicasPage() {
  const role = useRole()
  const canManage = stockCan(role, 'manage')
  const canViewCost = stockCan(role, 'view_cost')
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<{ id: string; name: string; baseUnit: string; isControlled: boolean; avgCost?: number }[]>([])
  const [defaultMode, setDefaultMode] = useState('CONFIRMADA')
  const [edit, setEdit] = useState<Kit | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', appointmentType: '', consumptionMode: '', notes: '', isActive: true })
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/estoque/kits').then((r) => r.json()).then((d) => setKits(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
    fetch('/api/estoque/items').then((r) => r.json()).then((d) => setCatalog(Array.isArray(d) ? d : []))
    fetch('/api/estoque/settings').then((r) => r.json()).then((d) => d?.defaultConsumptionMode && setDefaultMode(d.defaultConsumptionMode))
  }, [load])

  function open(k: Kit | 'new') {
    setError(null)
    setEdit(k)
    if (k === 'new') {
      setForm({ name: '', appointmentType: '', consumptionMode: '', notes: '', isActive: true })
      setLines([{ key: 'n0', itemId: '', quantity: '', variable: false, optional: false }])
    } else {
      setForm({ name: k.name, appointmentType: k.appointmentType || '', consumptionMode: k.consumptionMode || '', notes: k.notes || '', isActive: k.isActive })
      setLines(k.items.map((i, n) => ({ key: `e${n}`, itemId: i.itemId, quantity: String(i.quantity), variable: i.variable, optional: i.optional })))
    }
  }

  async function save() {
    setError(null)
    if (!form.name.trim()) return setError('Dê um nome à ficha')
    const items = lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity.replace(',', '.')) || 0, variable: l.variable, optional: l.optional }))
    const body = { ...form, appointmentType: form.appointmentType || null, consumptionMode: form.consumptionMode || null, notes: form.notes || null, items }
    const res = await apiSend(edit === 'new' ? '/api/estoque/kits' : `/api/estoque/kits/${(edit as Kit).id}`, edit === 'new' ? 'POST' : 'PATCH', body)
    if (!res.ok) return setError(res.data?.error || 'Erro ao salvar')
    setEdit(null); load()
  }

  async function remove(k: Kit) {
    if (!window.confirm(`Excluir a ficha "${k.name}"? As baixas já feitas continuam no histórico.`)) return
    const res = await apiSend(`/api/estoque/kits/${k.id}`, 'DELETE')
    if (!res.ok) setError(res.data?.error || 'Erro ao excluir'); else load()
  }

  const estimate = canViewCost
    ? lines.reduce((s, l) => s + (Number(l.quantity.replace(',', '.')) || 0) * (catalog.find((c) => c.id === l.itemId)?.avgCost ?? 0), 0)
    : null

  return (
    <div>
      <PageHeader title="Estoque" description="Fichas técnicas" icon={<ClipboardList className="h-5 w-5" />}
        actions={canManage ? <Button onClick={() => open('new')}><Plus className="mr-1.5 h-4 w-4" />Nova ficha</Button> : undefined} />
      <StockTabs role={role} />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        A ficha lista os materiais de um tipo de atendimento. Ao marcar o atendimento como realizado, o painel “Materiais utilizados”
        abre pré-preenchido (baixa <strong>confirmada</strong>) ou o kit já sai do estoque (baixa <strong>automática</strong>).
        Itens de quantidade variável, opcionais e controlados nunca saem sozinhos.
      </p>
      {error && !edit && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : kits.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nenhuma ficha técnica"
          description="Cadastre os materiais de cada tipo de atendimento para baixar o estoque pelo atendimento."
          action={canManage ? <Button onClick={() => open('new')}><Plus className="mr-1.5 h-4 w-4" />Nova ficha</Button> : undefined} />
      ) : (
        <ul className="space-y-3">
          {kits.map((k) => (
            <li key={k.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {k.name}
                    {!k.isActive && <StatusBadge tone="neutral">inativa</StatusBadge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {k.appointmentType ? `Dispara em: ${k.appointmentType}` : 'Aplicada à mão no atendimento'} · baixa {MODE_LABEL[k.consumptionMode || defaultMode].toLowerCase()}
                    {!k.consumptionMode && ' (padrão da clínica)'}
                    {canViewCost && k.estimatedCost != null && ` · custo estimado ${brl(k.estimatedCost)}`}
                  </p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => open(k)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(k)} aria-label={`Excluir ${k.name}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {k.items.map((i) => (
                  <li key={i.itemId} className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs">
                    {i.name} · {i.variable ? 'variável' : `${fmtQty(i.quantity)} ${i.baseUnit}`}{i.optional ? ' · opcional' : ''}
                    {i.isControlled && <ControlledBadge list={i.controlledList} />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'Nova ficha técnica' : 'Editar ficha técnica'} width="max-w-2xl">
        <div className="space-y-5">
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Toxina botulínica — terço superior" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de atendimento que dispara" hint="Igual ao “Tipo” do agendamento. Vazio = aplicada à mão no painel.">
              <Input list="agenda-types" value={form.appointmentType} onChange={(e) => setForm({ ...form, appointmentType: e.target.value })} />
              <datalist id="agenda-types">{APPOINTMENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="Baixa no atendimento">
              <FilterSelect className="w-full" value={form.consumptionMode} onChange={(e) => setForm({ ...form, consumptionMode: e.target.value })}>
                <option value="">Padrão da clínica ({MODE_LABEL[defaultMode]})</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="AUTOMATICA">Automática</option>
              </FilterSelect>
            </Field>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">Materiais</h4>
            <ul className="space-y-2">
              {lines.map((l) => {
                const c = catalog.find((x) => x.id === l.itemId)
                return (
                  <li key={l.key} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FilterSelect className="min-w-0 flex-1" value={l.itemId} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, itemId: e.target.value } : x)))} aria-label="Item">
                        <option value="">Item…</option>
                        {catalog.map((i) => <option key={i.id} value={i.id}>{i.name}{i.isControlled ? ' · CONTROLADO' : ''}</option>)}
                      </FilterSelect>
                      <Input inputMode="decimal" className="w-24" placeholder="Qtd." value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))} aria-label="Quantidade" />
                      <span className="text-sm text-muted-foreground">{c?.baseUnit}</span>
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remover</button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4">
                      <Check checked={l.variable} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, variable: v } : x)))}>Quantidade decidida na hora</Check>
                      <Check checked={l.optional} onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, optional: v } : x)))}>Opcional</Check>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines((ls) => [...ls, { key: `n${Date.now()}`, itemId: '', quantity: '', variable: false, optional: false }])}>
              <Plus className="mr-1 h-4 w-4" />Adicionar material
            </Button>
            {estimate != null && <p className="mt-2 text-sm text-muted-foreground">Custo estimado do kit: <strong>{brl(estimate)}</strong> (custo médio atual)</p>}
          </div>

          <Field label="Observações"><Textarea className="w-full" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Check checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })}>Ficha ativa</Check>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-2 border-t border-border bg-card px-5 py-3">
            <Button onClick={save}>Salvar ficha</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
          </div>
        </div>
      </Drawer>
    </div>
  )
}
