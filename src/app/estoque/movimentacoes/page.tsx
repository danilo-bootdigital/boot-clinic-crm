'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRightLeft, MinusCircle, Package, SlidersHorizontal, Trash2, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar'
import { MovementForm, OPERATION_LABELS, type Operation } from '@/components/stock/MovementForm'
import { MovementsTable, reverseWithPrompt, type Movement } from '@/components/stock/MovementsTable'
import { StockTabs, fmtDateTime, useLookups, useRole } from '@/components/stock/shared'
import { MOVEMENT_LABELS, stockCan } from '@/lib/stock-caps'
import { downloadCsv, dateStamp } from '@/lib/csv'

// Movimentações: atalhos rápidos (entrada, consumo interno, perda,
// transferência, ajuste) + o razão de toda a clínica com filtros.
export default function EstoqueMovimentacoesPage() {
  const role = useRole()
  const { lookups } = useLookups()
  const [rows, setRows] = useState<Movement[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('')
  const [locationId, setLocationId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [op, setOp] = useState<Operation | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const canViewCost = stockCan(role, 'view_cost')
  const canAdjust = stockCan(role, 'adjust')

  const fetchPage = useCallback((before?: string) => {
    const sp = new URLSearchParams({ limit: '100' })
    if (type) sp.set('type', type)
    if (locationId) sp.set('locationId', locationId)
    if (from) sp.set('from', `${from}T00:00:00`)
    if (to) sp.set('to', `${to}T23:59:59`)
    if (before) sp.set('before', before)
    return fetch(`/api/estoque/movements?${sp}`).then((r) => r.json())
  }, [type, locationId, from, to])

  const load = useCallback(() => {
    setLoading(true)
    fetchPage().then((d) => { setRows(d?.movements ?? []); setHasMore(!!d?.hasMore) }).finally(() => setLoading(false))
  }, [fetchPage])
  useEffect(() => { load() }, [load])

  const loadMore = () => {
    const last = rows[rows.length - 1]
    if (!last) return
    fetchPage(last.occurredAt).then((d) => { setRows((p) => [...p, ...(d?.movements ?? [])]); setHasMore(!!d?.hasMore) })
  }

  async function onReverse(m: Movement) {
    const err = await reverseWithPrompt(m)
    if (err === null) return
    setMsg(err || 'Movimentação estornada.')
    load()
  }

  const ops: { op: Operation; icon: React.ReactNode; show: boolean }[] = [
    { op: 'ENTRADA', icon: <ArrowDownToLine className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'receive') },
    { op: 'CONSUMO', icon: <MinusCircle className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'consume') },
    { op: 'TRANSFERENCIA', icon: <ArrowRightLeft className="mr-1.5 h-4 w-4" />, show: stockCan(role, 'transfer') },
    { op: 'PERDA', icon: <Trash2 className="mr-1.5 h-4 w-4" />, show: canAdjust },
    { op: 'AJUSTE', icon: <SlidersHorizontal className="mr-1.5 h-4 w-4" />, show: canAdjust },
  ]

  const exportCsv = () => {
    downloadCsv(
      `estoque-movimentacoes-${dateStamp()}`,
      ['Data', 'Movimento', 'Item', 'Local', 'Lote', 'Quantidade', 'Unidade', 'Paciente', 'Motivo', 'Por', 'Estornada'],
      rows.map((m) => [
        fmtDateTime(m.occurredAt), MOVEMENT_LABELS[m.type] ?? m.type, m.snapshot?.itemName ?? '', m.snapshot?.locationName ?? '',
        m.snapshot?.lotNumber ?? '', String(m.quantity).replace('.', ','), m.snapshot?.baseUnit ?? '', m.snapshot?.patientName ?? '',
        m.reason ?? '', m.createdByName, m.reversedAt ? 'sim' : '',
      ]),
    )
  }

  return (
    <div>
      <PageHeader title="Estoque" description="Movimentações" icon={<Package className="h-5 w-5" />} />
      <StockTabs role={role} />

      <div className="mb-6 flex flex-wrap gap-2">
        {ops.filter((o) => o.show).map((o) => (
          <Button key={o.op} variant={o.op === 'ENTRADA' ? 'default' : 'outline'} onClick={() => setOp(o.op)}>{o.icon}{OPERATION_LABELS[o.op]}</Button>
        ))}
      </div>

      {msg && <p role="status" className="mb-4 text-sm text-muted-foreground">{msg}</p>}

      <FilterBar
        filters={
          <>
            <FilterSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de movimento">
              <option value="">Todos os movimentos</option>
              {Object.entries(MOVEMENT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </FilterSelect>
            <FilterSelect value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Local">
              <option value="">Todos os locais</option>
              {lookups?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </FilterSelect>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" className="w-auto" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" className="w-auto" />
          </>
        }
        actions={<Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="mr-1.5 h-4 w-4" />CSV</Button>}
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma movimentação" description="Entradas, consumos, perdas, transferências e ajustes aparecem aqui." />
      ) : (
        <>
          <MovementsTable movements={rows} showItem canViewCost={canViewCost} canReverse={canAdjust} onReverse={onReverse} />
          {hasMore && <div className="mt-4 text-center"><Button variant="outline" onClick={loadMore}>Carregar mais</Button></div>}
        </>
      )}

      <Drawer open={!!op} onClose={() => setOp(null)} title={op ? OPERATION_LABELS[op] : ''} width="max-w-xl">
        {op && (
          <MovementForm
            key={op}
            operation={op}
            lookups={lookups}
            canViewCost={canViewCost}
            onCancel={() => setOp(null)}
            onDone={() => { setMsg(`${OPERATION_LABELS[op]}: movimentação registrada.`); setOp(null); load() }}
          />
        )}
      </Drawer>
    </div>
  )
}
