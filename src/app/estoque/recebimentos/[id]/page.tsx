'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, PackageCheck, Plus, Trash2, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterSelect } from '@/components/ui/filter-bar'
import {
  Check, ControlledBadge, ControlledNote, Field, RECEIPT_STATUS, StockTabs, apiSend, fmtDate, fmtDateTime, fmtQty, useLookups, useRole,
} from '@/components/stock/shared'
import { stockCan } from '@/lib/stock-caps'
import { allocateCents } from '@/lib/stock/rules'
import { brl, formatDate, RECEIVABLE_STATUS_LABELS, STATUS_TONE } from '@/lib/financial-format'

type CatalogItem = {
  id: string; name: string; baseUnit: string; purchaseUnit: string | null; conversionFactor: number
  tracksLot: boolean; tracksExpiry: boolean; isControlled: boolean; controlledList: string | null; controlledNote: string | null
}
type Line = { key: string; itemId: string; lotNumber: string; expiresAt: string; locationId: string; qtyPurchase: string; unitPrice: string }
type Receipt = Record<string, any>
type FinanceOptions = { canCreatePayable: boolean; categories: { id: string; name: string }[]; costCenters: { id: string; name: string }[]; defaultCategoryName: string }

const toNum = (s: string) => {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const isoDay = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const plusDays = (base: string, days: number) => {
  const d = base ? new Date(`${base}T12:00:00`) : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
let seq = 0
const newKey = () => `l${Date.now()}${seq++}`

export default function RecebimentoPage({ params }: { params: { id: string } }) {
  const role = useRole()
  const router = useRouter()
  const { lookups } = useLookups()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [fin, setFin] = useState<FinanceOptions | null>(null)

  // Rascunho (editável)
  const [supplierId, setSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceKey, setInvoiceKey] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [freight, setFreight] = useState('')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([])

  // Conta a pagar
  const [generatePayable, setGeneratePayable] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [installments, setInstallments] = useState('1')
  const [firstDueDate, setFirstDueDate] = useState('')
  const [intervalDays, setIntervalDays] = useState('30')
  const [confirmTemp, setConfirmTemp] = useState(false)
  const [needsTemp, setNeedsTemp] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const canViewCost = stockCan(role, 'view_cost')
  const canAdjust = stockCan(role, 'adjust')

  const load = useCallback(() => {
    fetch(`/api/estoque/receipts/${params.id}`).then(async (r) => {
      if (r.status === 404) return setNotFound(true)
      const d = await r.json()
      if (!d?.id) return setError(d?.error || 'Falha ao carregar')
      setReceipt(d)
      setSupplierId(d.supplierId || '')
      setInvoiceNumber(d.invoiceNumber || '')
      setInvoiceKey(d.invoiceKey || '')
      setInvoiceDate(isoDay(d.invoiceDate))
      setReceivedAt(isoDay(d.receivedAt))
      setFreight(d.freight ? String(d.freight) : '')
      setDiscount(d.discount ? String(d.discount) : '')
      setNotes(d.notes || '')
      setLines((d.items ?? []).map((l: any) => ({
        key: l.id, itemId: l.itemId, lotNumber: l.lotNumber || '', expiresAt: isoDay(l.expiresAt), locationId: l.locationId,
        qtyPurchase: String(l.qtyPurchase), unitPrice: String(l.unitPrice),
      })))
      setFirstDueDate((cur) => cur || plusDays(isoDay(d.invoiceDate) || isoDay(d.receivedAt), 30))
    })
  }, [params.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/estoque/items').then((r) => r.json()).then((d) => setCatalog(Array.isArray(d) ? d : []))
    fetch('/api/estoque/receipts/finance-options').then((r) => r.json()).then((d) => d && 'canCreatePayable' in d && setFin(d))
  }, [])

  const itemBy = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog])
  const locations = lookups?.locations ?? []
  const defaultLocation = (item?: CatalogItem) =>
    (item?.isControlled ? locations.find((l) => l.controlledStorage) : locations.find((l) => l.isDefault) ?? locations[0])?.id ?? ''

  // Prévia do rateio: mesma regra do servidor (centavos, proporcional ao valor da linha).
  const preview = useMemo(() => {
    const lineCents = lines.map((l) => Math.round(toNum(l.qtyPurchase) * toNum(l.unitPrice) * 100))
    const itemsCents = lineCents.reduce((s, c) => s + c, 0)
    const totalCents = itemsCents + Math.round(toNum(freight) * 100) - Math.round(toNum(discount) * 100)
    const net = allocateCents(Math.max(totalCents, 0), lineCents)
    return { lineCents, itemsCents, totalCents, net }
  }, [lines, freight, discount])

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const addLine = () => setLines((ls) => [...ls, { key: newKey(), itemId: '', lotNumber: '', expiresAt: '', locationId: defaultLocation(), qtyPurchase: '', unitPrice: '' }])

  function draftBody() {
    return {
      supplierId: supplierId || null,
      invoiceNumber: invoiceNumber || null,
      invoiceKey: invoiceKey || null,
      invoiceDate: invoiceDate || null,
      receivedAt: receivedAt ? `${receivedAt}T12:00:00` : null,
      freight: toNum(freight),
      discount: toNum(discount),
      notes: notes || null,
      items: lines.filter((l) => l.itemId).map((l) => ({
        itemId: l.itemId, lotNumber: l.lotNumber || null, expiresAt: l.expiresAt || null, locationId: l.locationId,
        qtyPurchase: toNum(l.qtyPurchase), unitPrice: toNum(l.unitPrice),
      })),
    }
  }

  function validateLines(): string | null {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (!l.itemId) return `Linha ${i + 1}: escolha o item`
      const item = itemBy.get(l.itemId)
      if (!(toNum(l.qtyPurchase) > 0)) return `Linha ${i + 1}: informe a quantidade`
      if (!l.locationId) return `Linha ${i + 1}: escolha o local`
      if (item?.tracksLot && !l.lotNumber.trim()) return `Linha ${i + 1}: informe o lote de ${item.name}`
    }
    return null
  }

  async function saveDraft(quiet = false) {
    setError(null); setMsg(null)
    setBusy(true)
    const res = await apiSend(`/api/estoque/receipts/${params.id}`, 'PATCH', draftBody())
    setBusy(false)
    if (!res.ok) { setError(res.data?.error || 'Erro ao salvar'); return false }
    if (!quiet) { setMsg('Rascunho salvo.'); load() }
    return true
  }

  async function confirm() {
    const invalid = lines.length === 0 ? 'Inclua ao menos um item' : validateLines()
    if (invalid) return setError(invalid)
    if (!(await saveDraft(true))) return
    setBusy(true)
    const res = await apiSend(`/api/estoque/receipts/${params.id}/confirm`, 'POST', {
      generatePayable, categoryId: categoryId || null, costCenterId: costCenterId || null,
      installments: Math.max(1, Math.floor(toNum(installments))), firstDueDate: firstDueDate || null,
      intervalDays: Math.max(1, Math.floor(toNum(intervalDays))), confirmTemperature: confirmTemp,
    })
    setBusy(false)
    if (!res.ok) {
      if (res.data?.code === 'TEMPERATURE_CONFIRM') setNeedsTemp(true)
      return setError(res.data?.error || 'Não foi possível confirmar')
    }
    setMsg(res.data.payablePending ? 'Recebimento confirmado. A conta a pagar ficou pendente para o financeiro.' : 'Recebimento confirmado: estoque atualizado.')
    load()
  }

  async function generateNow() {
    setError(null)
    setBusy(true)
    const res = await apiSend(`/api/estoque/receipts/${params.id}/payable`, 'POST', {
      categoryId: categoryId || null, costCenterId: costCenterId || null,
      installments: Math.max(1, Math.floor(toNum(installments))), firstDueDate: firstDueDate || null,
      intervalDays: Math.max(1, Math.floor(toNum(intervalDays))),
    })
    setBusy(false)
    if (!res.ok) return setError(res.data?.error || 'Não foi possível gerar a conta')
    setMsg('Conta a pagar gerada.')
    load()
  }

  async function reverse() {
    const reason = window.prompt('Estornar este recebimento? As entradas saem do estoque e a conta a pagar é cancelada.\n\nMotivo:')
    if (reason === null) return
    if (reason.trim().length < 3) return setError('Informe o motivo do estorno')
    setBusy(true)
    const res = await apiSend(`/api/estoque/receipts/${params.id}/reverse`, 'POST', { reason: reason.trim() })
    setBusy(false)
    if (!res.ok) return setError(res.data?.error || 'Não foi possível estornar')
    setMsg('Recebimento estornado.')
    load()
  }

  async function discard() {
    if (!window.confirm('Descartar este rascunho?')) return
    const res = await apiSend(`/api/estoque/receipts/${params.id}`, 'DELETE')
    if (res.ok) router.push('/estoque/recebimentos')
    else setError(res.data?.error || 'Não foi possível descartar')
  }

  if (notFound) return (
    <div>
      <PageHeader title="Estoque" icon={<PackageCheck className="h-5 w-5" />} />
      <EmptyState title="Recebimento não encontrado" action={<Link href="/estoque/recebimentos" className="text-sm text-primary hover:underline">Voltar</Link>} />
    </div>
  )
  if (!receipt) return <div className="p-8 text-center text-sm text-muted-foreground">{error || 'Carregando…'}</div>

  const draft = receipt.status === 'RASCUNHO'
  const st = RECEIPT_STATUS[receipt.status]

  const payableForm = fin?.canCreatePayable && (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Categoria de despesa">
        <FilterSelect className="w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{fin.defaultCategoryName} (padrão)</option>
          {fin.categories.filter((c) => c.name !== fin.defaultCategoryName).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
      </Field>
      <Field label="Centro de custo">
        <FilterSelect className="w-full" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
          <option value="">—</option>
          {fin.costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
      </Field>
      <Field label="Parcelas">
        <Input type="number" min={1} max={24} value={installments} onChange={(e) => setInstallments(e.target.value)} />
      </Field>
      <Field label="1º vencimento">
        <Input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
      </Field>
      {toNum(installments) > 1 && (
        <Field label="Intervalo entre parcelas (dias)">
          <Input type="number" min={1} max={120} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} />
        </Field>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader title="Estoque" description={`Recebimento #${receipt.number}`} icon={<PackageCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            {draft && <Button variant="ghost" onClick={discard} aria-label="Descartar rascunho"><Trash2 className="h-4 w-4" /></Button>}
            {receipt.status === 'CONFIRMADO' && canAdjust && <Button variant="outline" onClick={reverse} disabled={busy}><Undo2 className="mr-1.5 h-4 w-4" />Estornar</Button>}
          </div>
        } />
      <StockTabs role={role} />
      <Link href="/estoque/recebimentos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Recebimentos
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge tone={st?.tone}>{st?.label ?? receipt.status}</StatusBadge>
        <span>Aberto por {receipt.createdByName}</span>
        {receipt.confirmedAt && <span>· confirmado por {receipt.confirmedByName} em {fmtDateTime(receipt.confirmedAt)}</span>}
        {receipt.reversedAt && <span>· estornado por {receipt.reversedByName} em {fmtDateTime(receipt.reversedAt)}: {receipt.reverseReason}</span>}
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {msg && <p role="status" className="mb-4 text-sm text-muted-foreground">{msg}</p>}

      {/* Nota */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <h3 className="mb-4 text-base font-semibold">Nota fiscal</h3>
        {draft ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Fornecedor">
              <FilterSelect className="w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">—</option>
                {lookups?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Nº da NF"><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></Field>
            <Field label="Data de emissão"><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></Field>
            <Field label="Chave de acesso" hint="44 dígitos (opcional)." className="sm:col-span-2">
              <Input inputMode="numeric" value={invoiceKey} onChange={(e) => setInvoiceKey(e.target.value)} />
            </Field>
            <Field label="Recebido em"><Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
            <Field label="Frete (R$)" hint="Rateado no custo dos itens."><Input inputMode="decimal" value={freight} onChange={(e) => setFreight(e.target.value)} /></Field>
            <Field label="Desconto (R$)" hint="Rateado no custo dos itens."><Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
            <Field label="Observações" className="sm:col-span-2 lg:col-span-3"><Textarea className="w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Fornecedor</dt><dd>{receipt.supplierName || '—'}</dd></div>
            <div><dt className="text-muted-foreground">NF</dt><dd>{receipt.invoiceNumber || '—'}{receipt.invoiceDate ? ` · ${fmtDate(receipt.invoiceDate)}` : ''}</dd></div>
            <div><dt className="text-muted-foreground">Recebido em</dt><dd>{fmtDate(receipt.receivedAt)}</dd></div>
            {receipt.invoiceKey && <div className="sm:col-span-3"><dt className="text-muted-foreground">Chave de acesso</dt><dd className="break-all font-mono text-xs">{receipt.invoiceKey}</dd></div>}
            {receipt.notes && <div className="sm:col-span-3"><dt className="text-muted-foreground">Observações</dt><dd>{receipt.notes}</dd></div>}
          </dl>
        )}
      </section>

      {/* Itens */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Itens</h3>
          {draft && <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Adicionar item</Button>}
        </div>

        {draft ? (
          lines.length === 0 ? (
            <EmptyState title="Nenhum item na conferência" description="Adicione cada item da nota com lote, validade e quantidade."
              action={<Button size="sm" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Adicionar item</Button>} />
          ) : (
            <ul className="space-y-3">
              {lines.map((l, i) => {
                const item = itemBy.get(l.itemId)
                const unit = item?.purchaseUnit || item?.baseUnit || 'un'
                const factor = item ? Number(item.conversionFactor) || 1 : 1
                const qtyBase = toNum(l.qtyPurchase) * factor
                const net = preview.net[i] ?? 0
                const locs = item?.isControlled ? locations.filter((x) => x.controlledStorage) : locations
                return (
                  <li key={l.key} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Linha {i + 1}</span>
                      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remover</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                      <Field label="Item" required className="sm:col-span-2 lg:col-span-2">
                        <FilterSelect className="w-full" value={l.itemId} onChange={(e) => {
                          const it = itemBy.get(e.target.value)
                          setLine(l.key, { itemId: e.target.value, locationId: defaultLocation(it) })
                        }}>
                          <option value="">Selecione</option>
                          {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isControlled ? ' · CONTROLADO' : ''}</option>)}
                        </FilterSelect>
                      </Field>
                      <Field label="Local" required className="lg:col-span-1">
                        <FilterSelect className="w-full" value={l.locationId} onChange={(e) => setLine(l.key, { locationId: e.target.value })}>
                          <option value="">—</option>
                          {locs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </FilterSelect>
                      </Field>
                      {(!item || item.tracksLot) && (
                        <Field label="Lote" required className="lg:col-span-1">
                          <Input value={l.lotNumber} onChange={(e) => setLine(l.key, { lotNumber: e.target.value })} />
                        </Field>
                      )}
                      {(!item || item.tracksExpiry) && (
                        <Field label="Validade" className="lg:col-span-2">
                          <Input type="date" value={l.expiresAt} onChange={(e) => setLine(l.key, { expiresAt: e.target.value })} />
                        </Field>
                      )}
                      <Field label={`Qtd. (${unit})`} required hint={item?.purchaseUnit ? `= ${fmtQty(qtyBase)} ${item.baseUnit}` : undefined}>
                        <Input inputMode="decimal" value={l.qtyPurchase} onChange={(e) => setLine(l.key, { qtyPurchase: e.target.value })} />
                      </Field>
                      <Field label={`Preço por ${unit} (R$)`}>
                        <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} />
                      </Field>
                      <div className="flex flex-col justify-end text-sm sm:col-span-2 lg:col-span-4">
                        <p>Total da linha: <strong>{brl((preview.lineCents[i] ?? 0) / 100)}</strong></p>
                        {canViewCost && item && qtyBase > 0 && (
                          <p className="text-xs text-muted-foreground">Custo com frete/desconto: {brl(net / 100)} · {brl(net / 100 / qtyBase)}/{item.baseUnit}</p>
                        )}
                      </div>
                    </div>
                    {item?.isControlled && <ControlledNote className="mt-3" list={item.controlledList} note={item.controlledNote} />}
                  </li>
                )
              })}
            </ul>
          )
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Lote · validade</th>
                  <th className="px-4 py-3 font-medium">Local</th>
                  <th className="px-4 py-3 text-right font-medium">Qtd.</th>
                  <th className="px-4 py-3 text-right font-medium">Preço</th>
                  {canViewCost && <th className="px-4 py-3 text-right font-medium">Custo/unid. base</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(receipt.items ?? []).map((l: any) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/estoque/itens/${l.itemId}`} className="font-medium text-primary hover:underline">{l.item?.name ?? '—'}</Link>
                      {l.item?.isControlled && <div className="mt-1"><ControlledBadge list={l.item.controlledList} /></div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.lotNumber || '—'}{l.expiresAt ? ` · ${fmtDate(l.expiresAt)}` : ''}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.locationName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtQty(l.qtyPurchase)} {l.item?.purchaseUnit || l.item?.baseUnit}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{brl(l.unitPrice)}</td>
                    {canViewCost && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{l.unitCost != null ? `${brl(l.unitCost)}/${l.item?.baseUnit}` : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Totais */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <dl className="grid gap-2 text-sm sm:max-w-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Itens</dt><dd className="tabular-nums">{brl((draft ? preview.itemsCents : Math.round((Number(receipt.total) - Number(receipt.freight) + Number(receipt.discount)) * 100)) / 100)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd className="tabular-nums">{brl(draft ? toNum(freight) : Number(receipt.freight))}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="tabular-nums">− {brl(draft ? toNum(discount) : Number(receipt.discount))}</dd></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Total da nota</dt><dd className="tabular-nums">{brl(draft ? preview.totalCents / 100 : Number(receipt.total))}</dd></div>
        </dl>
      </section>

      {/* Conta a pagar */}
      {receipt.status === 'CONFIRMADO' && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-3 text-base font-semibold">Conta a pagar</h3>
          {receipt.payables?.length > 0 ? (
            <ul className="divide-y divide-border">
              {receipt.payables.map((p: any) => (
                <li key={p.id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/financeiro/pagar/${p.id}`} className="text-primary hover:underline">{p.description}</Link>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    vence {formatDate(p.dueDate)} · {brl(p.amount)}
                    <StatusBadge tone={STATUS_TONE[p.status]}>{RECEIVABLE_STATUS_LABELS[p.status] || p.status}</StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          ) : receipt.payableCount > 0 ? (
            <p className="text-sm text-muted-foreground">Conta a pagar gerada ({receipt.payableCount}). O detalhe fica no Financeiro.</p>
          ) : receipt.payablePending ? (
            fin?.canCreatePayable ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">A mercadoria entrou no estoque, mas a conta ainda não foi lançada.</p>
                {payableForm}
                <Button onClick={generateNow} disabled={busy}>Gerar conta a pagar</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Pendente: o financeiro foi avisado para lançar a conta.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Sem conta a pagar para este recebimento.</p>
          )}
        </section>
      )}

      {/* Confirmação */}
      {draft && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-1 text-base font-semibold">Confirmar recebimento</h3>
          <p className="mb-4 text-sm text-muted-foreground">Confere tudo? Ao confirmar, o estoque entra com o custo já com frete e desconto, e os lotes ficam rastreáveis.</p>
          {fin?.canCreatePayable ? (
            <div className="mb-4 space-y-4">
              <Check checked={generatePayable} onChange={setGeneratePayable}>Gerar a conta a pagar agora</Check>
              {generatePayable && payableForm}
            </div>
          ) : (
            <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">A conta a pagar ficará pendente para o financeiro, que recebe um aviso e uma tarefa.</p>
          )}
          {needsTemp && <Check checked={confirmTemp} onChange={setConfirmTemp}>Confirmo o armazenamento apesar da temperatura diferente do local.</Check>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={busy || lines.length === 0}>{busy ? 'Processando…' : 'Confirmar recebimento'}</Button>
            <Button variant="outline" onClick={() => saveDraft()} disabled={busy}>Salvar rascunho</Button>
          </div>
        </section>
      )}
    </div>
  )
}
