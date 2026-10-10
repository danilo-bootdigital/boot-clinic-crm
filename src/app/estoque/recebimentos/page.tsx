'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PackageCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar'
import { RECEIPT_STATUS, StockTabs, apiSend, fmtDate, useRole } from '@/components/stock/shared'
import { stockCan } from '@/lib/stock-caps'
import { brl } from '@/lib/financial-format'

type Row = {
  id: string; number: number; status: string; supplierName: string | null; invoiceNumber: string | null
  receivedAt: string; total: number; itemCount: number; payableIds: string[]; payablePending: boolean
}

// Recebimentos: conferência da nota → entradas com custo rateado + conta a pagar.
export default function RecebimentosPage() {
  const role = useRole()
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const sp = new URLSearchParams()
    if (status) sp.set('status', status)
    if (pending) sp.set('pending', '1')
    fetch(`/api/estoque/receipts?${sp}`).then((r) => r.json()).then((d) => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [status, pending])
  useEffect(() => { load() }, [load])

  async function createDraft() {
    setError(null)
    const res = await apiSend('/api/estoque/receipts', 'POST', { items: [] })
    if (!res.ok) return setError(res.data?.error || 'Não foi possível abrir o recebimento')
    router.push(`/estoque/recebimentos/${res.data.id}`)
  }

  const canReceive = stockCan(role, 'receive')

  return (
    <div>
      <PageHeader
        title="Estoque" description="Recebimentos" icon={<PackageCheck className="h-5 w-5" />}
        actions={canReceive ? <Button onClick={createDraft}><Plus className="mr-1.5 h-4 w-4" />Novo recebimento</Button> : undefined}
      />
      <StockTabs role={role} />
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      <FilterBar
        filters={
          <>
            <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Todos</option>
              {Object.entries(RECEIPT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </FilterSelect>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm">
              <input type="checkbox" className="accent-primary" checked={pending} onChange={(e) => setPending(e.target.checked)} />
              Conta a pagar pendente
            </label>
          </>
        }
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="Nenhum recebimento"
          description="Ao chegar mercadoria, abra um recebimento: confira itens, lotes e validades da nota e confirme. O estoque entra e a conta a pagar é gerada." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Recebido em</th>
                <th className="px-4 py-3 font-medium">Fornecedor · NF</th>
                <th className="px-4 py-3 text-right font-medium">Itens</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3"><Link href={`/estoque/recebimentos/${r.id}`} className="font-medium text-primary hover:underline">#{r.number}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.receivedAt)}</td>
                  <td className="px-4 py-3">{r.supplierName || '—'}<span className="text-muted-foreground">{r.invoiceNumber ? ` · NF ${r.invoiceNumber}` : ''}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.itemCount}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{brl(r.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge tone={RECEIPT_STATUS[r.status]?.tone}>{RECEIPT_STATUS[r.status]?.label ?? r.status}</StatusBadge>
                      {r.payablePending && <StatusBadge tone="warning" dot={false}>conta pendente</StatusBadge>}
                      {r.status === 'CONFIRMADO' && r.payableIds.length > 0 && <StatusBadge tone="info" dot={false}>conta gerada</StatusBadge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
