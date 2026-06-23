'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Wallet, Plus, TrendingDown, AlertTriangle, CircleDollarSign, Clock, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { NewPayableForm } from '@/components/financial/NewPayableForm'
import { payableCan } from '@/lib/financial-caps'
import { brl, formatDate, RECEIVABLE_STATUS_LABELS, STATUS_TONE } from '@/lib/financial-format'
import { downloadCsv, csvMoney, dateStamp } from '@/lib/csv'

interface Summary { totalDespesas: number; pago: number; aPagar: number; vencido: number; totalContas: number }
interface Payable {
  id: string; supplierName: string | null; description: string; categoryName: string | null
  finalAmount: number; balance: number; status: string; displayStatus: string; dueDate: string
}

export default function ContasPagarPage() {
  const [role, setRole] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Payable[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [denied, setDenied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = status ? `?status=${status}` : ''
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch('/api/financeiro/payables/summary').then((r) => r.json()),
      fetch(`/api/financeiro/payables${qs}`).then((r) => (r.status === 403 ? { _denied: true } : r.json())),
    ])
      .then(([me, sum, list]) => {
        setRole(me?.role || '')
        if (list && (list as any)._denied) { setDenied(true); return }
        if (!sum?.error) setSummary(sum)
        setRows(Array.isArray(list) ? list : [])
      })
      .finally(() => setLoading(false))
  }, [status])
  useEffect(() => { load() }, [load])

  const canCreate = payableCan(role, 'create')

  const exportCsv = () => {
    downloadCsv(
      `contas-a-pagar-${dateStamp()}`,
      ['Fornecedor', 'Descrição', 'Categoria', 'Vencimento', 'Valor', 'Saldo', 'Status'],
      rows.map((r) => [
        r.supplierName || '—',
        r.description,
        r.categoryName || '—',
        formatDate(r.dueDate),
        csvMoney(r.finalAmount),
        csvMoney(r.balance),
        RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus,
      ]),
    )
  }

  if (denied) return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Contas a Pagar" icon={<Wallet className="h-5 w-5" />} />
      <FinanceTabs role={role} />
      <EmptyState title="Sem acesso" description="Contas a Pagar é restrito a OWNER, MANAGER e Financeiro." />
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Financeiro" description="Contas a Pagar" icon={<Wallet className="h-5 w-5" />}
        actions={canCreate && !showNew ? (<Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Nova despesa</Button>) : undefined}
      />
      <FinanceTabs role={role} />

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total despesas" value={brl(summary.totalDespesas)} icon={<CircleDollarSign className="h-4 w-4" />} tone="primary" hint={`${summary.totalContas} contas`} />
          <StatCard label="Pago" value={brl(summary.pago)} icon={<TrendingDown className="h-4 w-4" />} tone="success" />
          <StatCard label="A pagar" value={brl(summary.aPagar)} icon={<Clock className="h-4 w-4" />} tone="warning" />
          <StatCard label="Vencido" value={brl(summary.vencido)} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
        </div>
      )}

      {showNew && (<div className="mb-6"><NewPayableForm onCreated={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} /></div>)}

      <FilterBar
        filters={
          <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="PAGO">Pago</option>
            <option value="CANCELADO">Cancelado</option>
          </FilterSelect>
        }
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-4 w-4" />Exportar CSV
          </Button>
        }
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma despesa" description="Lance uma despesa com fornecedor, categoria e centro de custo." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/financeiro/pagar/${r.id}`} className="font-medium text-primary hover:underline">{r.supplierName || '—'}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.categoryName || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.finalAmount)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.balance)}</td>
                  <td className="px-4 py-3"><StatusBadge tone={STATUS_TONE[r.displayStatus]}>{RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
