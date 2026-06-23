'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Wallet, Plus, TrendingUp, AlertTriangle, CircleDollarSign, Clock, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { NewReceivableForm } from '@/components/financial/NewReceivableForm'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { financialCan } from '@/lib/financial-caps'
import { brl, formatDate, RECEIVABLE_STATUS_LABELS, STATUS_TONE } from '@/lib/financial-format'
import { downloadCsv, csvMoney, dateStamp } from '@/lib/csv'

interface Summary {
  faturado: number; recebido: number; emAberto: number; vencido: number
  ticketMedio: number; totalRecebiveis: number
}
interface Receivable {
  id: string; patientName: string | null; description: string
  finalAmount: number; paidAmount: number; balance: number
  installmentsCount: number; status: string; displayStatus: string; issueDate: string
}

export default function FinanceiroPage() {
  const [role, setRole] = useState<string>('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Receivable[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = status ? `?status=${status}` : ''
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch('/api/financeiro/summary').then((r) => r.json()),
      fetch(`/api/financeiro/receivables${qs}`).then((r) => r.json()),
    ])
      .then(([me, sum, list]) => {
        setRole(me?.role || '')
        if (!sum?.error) setSummary(sum)
        setRows(Array.isArray(list) ? list : [])
      })
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => { load() }, [load])

  const canCreate = financialCan(role, 'create')

  const exportCsv = () => {
    downloadCsv(
      `contas-a-receber-${dateStamp()}`,
      ['Paciente', 'Descrição', 'Emissão', 'Valor', 'Saldo', 'Parcelas', 'Status'],
      rows.map((r) => [
        r.patientName || 'Paciente',
        r.description,
        formatDate(r.issueDate),
        csvMoney(r.finalAmount),
        csvMoney(r.balance),
        r.installmentsCount,
        RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus,
      ]),
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader
        title="Financeiro" description="Contas a Receber" icon={<Wallet className="h-5 w-5" />}
        actions={canCreate && !showNew ? (
          <Button onClick={() => setShowNew(true)}><Plus className="mr-1.5 h-4 w-4" />Novo recebível</Button>
        ) : undefined}
      />

      <FinanceTabs role={role} />

      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Faturado" value={brl(summary.faturado)} icon={<CircleDollarSign className="h-4 w-4" />} tone="primary" hint={`${summary.totalRecebiveis} recebíveis`} />
          <StatCard label="Recebido" value={brl(summary.recebido)} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
          <StatCard label="Em aberto" value={brl(summary.emAberto)} icon={<Clock className="h-4 w-4" />} tone="warning" />
          <StatCard label="Vencido" value={brl(summary.vencido)} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="parcelas em atraso" />
        </div>
      )}

      {showNew && (
        <div className="mb-6">
          <NewReceivableForm onCreated={() => { setShowNew(false); load() }} onCancel={() => setShowNew(false)} />
        </div>
      )}

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
        <EmptyState title="Nenhum recebível" description="Crie um recebível a partir de um orçamento aprovado ou contrato assinado." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
                <th className="px-4 py-3 font-medium">Parc.</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/financeiro/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.patientName || 'Paciente'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.issueDate)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.finalAmount)}</td>
                  <td className="px-4 py-3 text-right">{brl(r.balance)}</td>
                  <td className="px-4 py-3">{r.installmentsCount}x</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[r.displayStatus]}>
                      {RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus}
                    </StatusBadge>
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
