'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Package, PackageX, Plus, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchInput } from '@/components/ui/search-input'
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar'
import { Drawer } from '@/components/ui/drawer'
import { StatusBadge } from '@/components/ui/status-badge'
import { ItemForm } from '@/components/stock/ItemForm'
import { ControlledBadge, StockStatusBadge, StockTabs, fmtDate, fmtQty, useLookups, useRole } from '@/components/stock/shared'
import { ITEM_KIND_LABELS, stockCan, type StockStatus } from '@/lib/stock-caps'
import { brl } from '@/lib/financial-format'
import { downloadCsv, dateStamp } from '@/lib/csv'

type Row = {
  id: string; name: string; sku: string | null; kind: string; categoryId: string | null; baseUnit: string
  isControlled: boolean; controlledList: string | null; controlledNote: string | null
  totalQty: number; status: StockStatus; expiredQty: number; expiringQty: number; nearestExpiry: string | null
  stockValue?: number; isActive: boolean
}

// Catálogo do estoque: saldo total, situação de reposição, validade e o selo
// de controlado com a observação sempre visível (§5.11).
export default function EstoqueItensPage() {
  const role = useRole()
  const { lookups } = useLookups()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [locationId, setLocationId] = useState('')
  const [controlled, setControlled] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const canManage = stockCan(role, 'manage')
  const canViewCost = stockCan(role, 'view_cost')

  const load = useCallback(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (q.trim()) sp.set('q', q.trim())
    if (categoryId) sp.set('categoryId', categoryId)
    if (kind) sp.set('kind', kind)
    if (status) sp.set('status', status)
    if (locationId) sp.set('locationId', locationId)
    if (controlled) sp.set('controlled', '1')
    fetch(`/api/estoque/items?${sp}`)
      .then((r) => (r.status === 403 ? { _denied: true } : r.json()))
      .then((d) => {
        if (d && (d as any)._denied) { setDenied(true); return }
        setRows(Array.isArray(d) ? d : [])
      })
      .finally(() => setLoading(false))
  }, [q, categoryId, kind, status, locationId, controlled])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const catName = useMemo(() => new Map((lookups?.categories ?? []).map((c) => [c.id, c.name])), [lookups])
  const kpis = useMemo(() => ({
    total: rows.length,
    repor: rows.filter((r) => r.status === 'repor' || r.status === 'critico').length,
    expiring: rows.filter((r) => r.expiringQty > 0).length,
    expired: rows.filter((r) => r.expiredQty > 0).length,
    value: rows.reduce((s, r) => s + (r.stockValue ?? 0), 0),
  }), [rows])

  const exportCsv = () => {
    downloadCsv(
      `estoque-itens-${dateStamp()}`,
      ['Item', 'SKU', 'Tipo', 'Categoria', 'Saldo', 'Unidade', 'Situação', 'Próxima validade', 'Controlado', ...(canViewCost ? ['Valor em estoque'] : [])],
      rows.map((r) => [
        r.name, r.sku || '', ITEM_KIND_LABELS[r.kind] || r.kind, r.categoryId ? catName.get(r.categoryId) || '' : '',
        String(r.totalQty).replace('.', ','), r.baseUnit, r.status, r.nearestExpiry ? fmtDate(r.nearestExpiry) : '',
        r.isControlled ? `Lista ${r.controlledList}` : '',
        ...(canViewCost ? [(r.stockValue ?? 0).toFixed(2).replace('.', ',')] : []),
      ]),
    )
  }

  if (denied) return (
    <div>
      <PageHeader title="Estoque" icon={<Package className="h-5 w-5" />} />
      <EmptyState title="Sem acesso" description="Seu perfil não tem acesso ao estoque." />
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Quanto tem, onde está e o que vence."
        icon={<Package className="h-5 w-5" />}
        actions={canManage ? <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Novo item</Button> : undefined}
      />
      <StockTabs role={role} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canViewCost
          ? <StatCard label="Valor em estoque" value={brl(kpis.value)} hint={`${kpis.total} itens`} icon={<Package className="h-4 w-4" />} />
          : <StatCard label="Itens" value={kpis.total} icon={<Package className="h-4 w-4" />} />}
        <StatCard label="Abaixo do ponto de pedido" value={kpis.repor} icon={<PackageX className="h-4 w-4" />} tone="warning" />
        <StatCard label="Vencendo" value={kpis.expiring} hint="dentro do prazo de alerta" icon={<CalendarClock className="h-4 w-4" />} tone="warning" />
        <StatCard label="Com lote vencido" value={kpis.expired} hint="só sai como perda" icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
      </div>

      <FilterBar
        search={<SearchInput placeholder="Buscar item, SKU, fabricante…" value={q} onChange={setQ} containerClassName="sm:max-w-xs" />}
        filters={
          <>
            <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
              <option value="">Toda situação</option>
              <option value="critico">Crítico</option>
              <option value="repor">Repor</option>
              <option value="zerado">Zerado</option>
              <option value="ok">OK</option>
            </FilterSelect>
            <FilterSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
            <FilterSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
              <option value="">Todos os tipos</option>
              {Object.entries(ITEM_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </FilterSelect>
            <FilterSelect value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Local">
              <option value="">Todos os locais</option>
              {lookups?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </FilterSelect>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm">
              <input type="checkbox" className="accent-primary" checked={controlled} onChange={(e) => setControlled(e.target.checked)} />
              Controlados
            </label>
          </>
        }
        actions={<Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="mr-1.5 h-4 w-4" />CSV</Button>}
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title={q || categoryId || kind || status || locationId || controlled ? 'Nenhum item com esses filtros' : 'Nenhum item cadastrado'}
          description="Cadastre os itens e registre o saldo inicial com uma entrada avulsa."
          action={canManage ? <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Novo item</Button> : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Validade</th>
                {canViewCost && <th className="px-4 py-3 text-right font-medium">Valor</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/estoque/itens/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{ITEM_KIND_LABELS[r.kind] || r.kind}</span>
                      {r.sku && <span>· {r.sku}</span>}
                      {r.isControlled && <ControlledBadge list={r.controlledList} />}
                    </div>
                    {r.isControlled && r.controlledNote && <p className="mt-1 max-w-md text-xs text-destructive">{r.controlledNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.categoryId ? catName.get(r.categoryId) || '—' : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtQty(r.totalQty)} <span className="text-muted-foreground">{r.baseUnit}</span></td>
                  <td className="px-4 py-3"><StockStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    {r.expiredQty > 0 && <StatusBadge tone="destructive">{fmtQty(r.expiredQty)} {r.baseUnit} vencido</StatusBadge>}
                    {r.nearestExpiry
                      ? <p className={r.expiringQty > 0 ? 'text-warning-strong' : 'text-muted-foreground'}>{fmtDate(r.nearestExpiry)}</p>
                      : r.expiredQty === 0 && <span className="text-muted-foreground">—</span>}
                  </td>
                  {canViewCost && <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{brl(r.stockValue ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={showNew} onClose={() => setShowNew(false)} title="Novo item" width="max-w-2xl">
        <ItemForm lookups={lookups} canViewCost={canViewCost} onCancel={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />
      </Drawer>
    </div>
  )
}
