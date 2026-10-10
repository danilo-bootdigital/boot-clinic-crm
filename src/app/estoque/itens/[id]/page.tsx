'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowDownToLine, ArrowRightLeft, MinusCircle, Package, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterSelect } from '@/components/ui/filter-bar'
import { ItemForm } from '@/components/stock/ItemForm'
import { MovementForm, OPERATION_LABELS, type Operation } from '@/components/stock/MovementForm'
import { MovementsTable, reverseWithPrompt, type Movement } from '@/components/stock/MovementsTable'
import { ControlledBadge, ControlledNote, StockStatusBadge, StockTabs, fmtDate, fmtQty, useLookups, useRole } from '@/components/stock/shared'
import { ITEM_KIND_LABELS, LOT_STATUS_LABELS, STORAGE_TEMP_LABELS, isExpired, stockCan } from '@/lib/stock-caps'
import { brl } from '@/lib/financial-format'

type Detail = {
  item: Record<string, any>
  balances: { id: string; quantity: number; locationId: string; locationName: string; lotId: string; lotNumber: string; expiresAt: string | null; lotStatus: string }[]
  lots: { id: string; lotNumber: string; expiresAt: string | null; status: string; blockReason: string | null; quantity: number; unitCost?: number }[]
  purchases: { receiptId: string; number: number; receivedAt: string; invoiceNumber: string | null; supplierName: string | null; qtyPurchase: number; unitPrice: number; unitCost?: number | null }[]
}

type MoveState = { op: Operation; locationId?: string; lotId?: string } | null

export default function EstoqueItemPage({ params }: { params: { id: string } }) {
  const role = useRole()
  const { lookups } = useLookups()
  const [data, setData] = useState<Detail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [movements, setMovements] = useState<Movement[]>([])
  const [kardexLocation, setKardexLocation] = useState('')
  const [edit, setEdit] = useState(false)
  const [move, setMove] = useState<MoveState>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const canViewCost = stockCan(role, 'view_cost')
  const canManage = stockCan(role, 'manage')
  const canAdjust = stockCan(role, 'adjust')

  const load = useCallback(() => {
    fetch(`/api/estoque/items/${params.id}`).then(async (r) => {
      if (r.status === 404) { setNotFound(true); return }
      const d = await r.json()
      if (d?.item) setData(d)
    })
    const sp = new URLSearchParams({ itemId: params.id, limit: '200' })
    if (kardexLocation) sp.set('locationId', kardexLocation)
    fetch(`/api/estoque/movements?${sp}`).then((r) => r.json()).then((d) => setMovements(d?.movements ?? []))
  }, [params.id, kardexLocation])
  useEffect(() => { load() }, [load])

  async function onReverse(m: Movement) {
    const err = await reverseWithPrompt(m)
    if (err === null) return
    setMsg(err || 'Movimentação estornada.')
    load()
  }

  async function changeLotStatus(lotId: string, status: string) {
    let blockReason: string | null = null
    if (status !== 'LIBERADO') {
      blockReason = window.prompt(`Motivo para marcar o lote como ${LOT_STATUS_LABELS[status].toLowerCase()}:`)
      if (blockReason === null) return
    }
    const res = await fetch(`/api/estoque/lots/${lotId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, blockReason }),
    })
    setMsg(res.ok ? 'Status do lote atualizado.' : (await res.json().catch(() => ({}))).error || 'Erro ao atualizar o lote')
    load()
  }

  async function removeItem() {
    if (!data || !window.confirm(`Excluir "${data.item.name}"? O histórico de movimentações é mantido.`)) return
    const res = await fetch(`/api/estoque/items/${params.id}`, { method: 'DELETE' })
    if (res.ok) window.location.href = '/estoque'
    else setMsg((await res.json().catch(() => ({}))).error || 'Não foi possível excluir')
  }

  if (notFound) return (
    <div>
      <PageHeader title="Estoque" icon={<Package className="h-5 w-5" />} />
      <EmptyState title="Item não encontrado" action={<Link href="/estoque" className="text-sm text-primary hover:underline">Voltar ao catálogo</Link>} />
    </div>
  )
  if (!data) return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>

  const item = data.item
  const unit = item.baseUnit
  const ops: { op: Operation; icon: React.ReactNode; show: boolean }[] = [
    { op: 'ENTRADA', icon: <ArrowDownToLine className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'receive') },
    { op: 'CONSUMO', icon: <MinusCircle className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'consume') },
    { op: 'TRANSFERENCIA', icon: <ArrowRightLeft className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'transfer') },
    { op: 'PERDA', icon: <Trash2 className="mr-1.5 h-4 w-4" />, show: canAdjust },
    { op: 'AJUSTE', icon: <SlidersHorizontal className="mr-1.5 h-4 w-4" />, show: canAdjust },
  ]
  const kardexLocations = Array.from(new Map(data.balances.map((b) => [b.locationId, b.locationName])).entries())

  return (
    <div>
      <PageHeader
        title="Estoque"
        description={item.name}
        icon={<Package className="h-5 w-5" />}
        actions={canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="mr-1.5 h-4 w-4" />Editar</Button>
            <Button variant="ghost" onClick={removeItem} aria-label="Excluir item"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ) : undefined}
      />
      <StockTabs role={role} />

      <Link href="/estoque" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Catálogo
      </Link>

      <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <StockStatusBadge status={item.status} />
          {item.isControlled && <ControlledBadge list={item.controlledList} />}
          {!item.isActive && <StatusBadge tone="neutral">inativo</StatusBadge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {[ITEM_KIND_LABELS[item.kind], item.categoryName, item.manufacturer, item.anvisaRegistration && `ANVISA ${item.anvisaRegistration}`, item.sku && `SKU ${item.sku}`]
            .filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Unidade base: {unit}{item.purchaseUnit ? ` · 1 ${item.purchaseUnit} = ${fmtQty(item.conversionFactor)} ${unit}` : ''} · {STORAGE_TEMP_LABELS[item.storageTemp]}
          {item.tracksPatient ? ' · exige paciente na saída' : ''}{item.multiDose ? ' · multidose' : ''}
        </p>
        {item.isControlled && <ControlledNote className="mt-3" list={item.controlledList} note={item.controlledNote} />}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo total" value={`${fmtQty(item.totalQty)} ${unit}`} hint={item.reorderPoint != null ? `ponto de pedido: ${fmtQty(item.reorderPoint)}` : undefined} />
        <StatCard label="Próxima validade" value={item.nearestExpiry ? fmtDate(item.nearestExpiry) : '—'} tone={item.expiringQty > 0 ? 'warning' : 'muted'}
          hint={item.expiringQty > 0 ? `${fmtQty(item.expiringQty)} ${unit} vencendo` : undefined} />
        <StatCard label="Vencido" value={`${fmtQty(item.expiredQty)} ${unit}`} tone={item.expiredQty > 0 ? 'destructive' : 'muted'} hint="só sai como perda" />
        {canViewCost
          ? <StatCard label="Valor em estoque" value={brl(item.stockValue ?? 0)} hint={`custo médio ${brl(item.avgCost ?? 0)}/${unit}`} />
          : <StatCard label="Fornecedor preferencial" value={item.preferredSupplierName || '—'} tone="muted" />}
      </div>

      {msg && <p role="status" className="mb-4 text-sm text-muted-foreground">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {ops.filter((o) => o.show).map((o) => (
          <Button key={o.op} variant={o.op === 'ENTRADA' ? 'default' : 'outline'} size="sm" onClick={() => setMove({ op: o.op })} disabled={!item.isActive}>
            {o.icon}{OPERATION_LABELS[o.op]}
          </Button>
        ))}
      </div>

      <section className="mb-8">
        <h3 className="mb-3 text-base font-semibold">Saldos por local e lote</h3>
        {data.balances.length === 0 ? (
          <EmptyState title="Sem saldo" description="Registre uma entrada para começar." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Local</th>
                  <th className="px-4 py-3 font-medium">Lote</th>
                  <th className="px-4 py-3 font-medium">Validade</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  <th className="px-4 py-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.balances.map((b) => {
                  const expired = isExpired(b.expiresAt)
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3">{b.locationName}</td>
                      <td className="px-4 py-3">
                        {b.lotNumber}
                        {b.lotStatus !== 'LIBERADO' && <StatusBadge tone="warning" className="ml-2">{LOT_STATUS_LABELS[b.lotStatus]}</StatusBadge>}
                      </td>
                      <td className="px-4 py-3">{expired ? <StatusBadge tone="destructive">vencido {fmtDate(b.expiresAt)}</StatusBadge> : fmtDate(b.expiresAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtQty(b.quantity)} {unit}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {expired || b.lotStatus !== 'LIBERADO' ? (
                          canAdjust && <Button size="sm" variant="ghost" onClick={() => setMove({ op: 'PERDA', locationId: b.locationId, lotId: b.lotId })}>Registrar perda</Button>
                        ) : (
                          <>
                            {stockCan(role, 'consume') && <Button size="sm" variant="ghost" onClick={() => setMove({ op: 'CONSUMO', locationId: b.locationId, lotId: b.lotId })}>Consumir</Button>}
                            {stockCan(role, 'transfer') && <Button size="sm" variant="ghost" onClick={() => setMove({ op: 'TRANSFERENCIA', locationId: b.locationId, lotId: b.lotId })}>Transferir</Button>}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {item.tracksLot && data.lots.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-base font-semibold">Lotes</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.lots.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    Lote {l.lotNumber}
                    <span className="ml-2 font-normal text-muted-foreground">val. {fmtDate(l.expiresAt)} · {fmtQty(l.quantity)} {unit}{canViewCost && l.unitCost != null ? ` · entrada ${brl(l.unitCost)}/${unit}` : ''}</span>
                  </p>
                  {l.blockReason && <p className="text-xs text-warning-strong">{l.blockReason}</p>}
                </div>
                {canManage ? (
                  <FilterSelect value={l.status} onChange={(e) => changeLotStatus(l.id, e.target.value)} aria-label={`Status do lote ${l.lotNumber}`}>
                    {Object.entries(LOT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </FilterSelect>
                ) : (
                  <StatusBadge tone={l.status === 'LIBERADO' ? 'success' : 'warning'}>{LOT_STATUS_LABELS[l.status]}</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canViewCost && data.purchases?.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 text-base font-semibold">Últimas compras</h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {data.purchases.map((p) => (
              <li key={`${p.receiptId}-${p.unitPrice}-${p.qtyPurchase}`} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <Link href={`/estoque/recebimentos/${p.receiptId}`} className="text-primary hover:underline">#{p.number}</Link>
                  <span className="text-muted-foreground"> · {fmtDate(p.receivedAt)} · {p.supplierName || 'sem fornecedor'}{p.invoiceNumber ? ` · NF ${p.invoiceNumber}` : ''}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtQty(p.qtyPurchase)} {item.purchaseUnit || unit} × {brl(p.unitPrice)}{p.unitCost != null ? ` · custo ${brl(p.unitCost)}/${unit}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Kardex</h3>
          {kardexLocations.length > 1 && (
            <FilterSelect value={kardexLocation} onChange={(e) => setKardexLocation(e.target.value)} aria-label="Local do kardex">
              <option value="">Todos os locais</option>
              {kardexLocations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </FilterSelect>
          )}
        </div>
        {movements.length === 0
          ? <EmptyState title="Nenhuma movimentação" />
          : <MovementsTable movements={movements} showBalance canViewCost={canViewCost} canReverse={canAdjust} onReverse={onReverse} />}
      </section>

      <Drawer open={edit} onClose={() => setEdit(false)} title="Editar item" width="max-w-2xl">
        <ItemForm item={item} lookups={lookups} canViewCost={canViewCost} onCancel={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />
      </Drawer>

      <Drawer open={!!move} onClose={() => setMove(null)} title={move ? OPERATION_LABELS[move.op] : ''} width="max-w-xl">
        {move && (
          <MovementForm
            key={`${move.op}-${move.locationId ?? ''}-${move.lotId ?? ''}`}
            operation={move.op}
            itemId={params.id}
            locationId={move.locationId}
            lotId={move.lotId}
            lookups={lookups}
            canViewCost={canViewCost}
            onCancel={() => setMove(null)}
            onDone={() => { setMove(null); setMsg(`${OPERATION_LABELS[move.op]}: movimentação registrada.`); load() }}
          />
        )}
      </Drawer>
    </div>
  )
}
