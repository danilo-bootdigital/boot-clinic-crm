'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Users, CalendarClock, ListChecks, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { brl } from '@/lib/financial-format'
import { downloadCsv, csvMoney, dateStamp } from '@/lib/csv'
import { cn } from '@/lib/utils'

type BucketKey = 'b30' | 'b60' | 'b90' | 'b120' | 'b120p'

interface Bucket { key: BucketKey; label: string; count: number; total: number }
interface PatientRow {
  patientId: string
  patientName: string | null
  total: number
  count: number
  oldestDays: number
  buckets: Record<BucketKey, number>
}
interface Aging {
  total: number; totalCount: number; patientCount: number; oldestDays: number
  buckets: Bucket[]
  patients: PatientRow[]
}

// Severidade visual por faixa de atraso (quanto mais velho, mais grave).
const BUCKET_TONE: Record<BucketKey, 'warning' | 'destructive'> = {
  b30: 'warning', b60: 'warning', b90: 'destructive', b120: 'destructive', b120p: 'destructive',
}
const BUCKET_SHORT: Record<BucketKey, string> = {
  b30: '≤30d', b60: '31–60', b90: '61–90', b120: '91–120', b120p: '120+',
}

export default function InadimplenciaPage() {
  const [role, setRole] = useState('')
  const [data, setData] = useState<Aging | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [filter, setFilter] = useState<BucketKey | ''>('') // '' = todas as faixas

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch('/api/financeiro/aging').then((r) => (r.status === 403 ? { _denied: true } : r.json())),
    ]).then(([me, ag]) => {
      setRole(me?.role || '')
      if (ag?._denied || ag?.error) { setDenied(true); return }
      setData(ag)
    }).finally(() => setLoading(false))
  }, [])

  // Linhas filtradas pela faixa selecionada (saldo da faixa, ou total quando "todas").
  const rows = useMemo(() => {
    if (!data) return []
    if (!filter) return data.patients
    return data.patients
      .filter((p) => p.buckets[filter] > 0)
      .map((p) => ({ ...p, total: p.buckets[filter] }))
      .sort((a, b) => b.total - a.total)
  }, [data, filter])

  const exportCsv = () => {
    downloadCsv(
      `inadimplencia-${dateStamp()}`,
      ['Paciente', 'Parcelas vencidas', 'Atraso máx. (dias)', 'Saldo em atraso'],
      rows.map((p) => [p.patientName || 'Paciente', p.count, p.oldestDays, csvMoney(p.total)]),
    )
  }

  if (denied) return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Inadimplência" icon={<AlertTriangle className="h-5 w-5" />} />
      <FinanceTabs role={role} />
      <EmptyState title="Sem acesso" description="O painel de inadimplência é restrito a quem tem acesso ao financeiro." />
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Inadimplência — parcelas vencidas em aberto" icon={<AlertTriangle className="h-5 w-5" />} />
      <FinanceTabs role={role} />

      {loading || !data ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : data.totalCount === 0 ? (
        <EmptyState title="Sem inadimplência" description="Não há parcelas vencidas em aberto. 🎉" icon={<AlertTriangle className="h-6 w-6" />} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total em atraso" value={brl(data.total)} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" hint="saldo de parcelas vencidas" />
            <StatCard label="Pacientes inadimplentes" value={data.patientCount} icon={<Users className="h-4 w-4" />} tone="warning" />
            <StatCard label="Parcelas vencidas" value={data.totalCount} icon={<ListChecks className="h-4 w-4" />} tone="muted" />
            <StatCard label="Atraso máximo" value={`${data.oldestDays} dias`} icon={<CalendarClock className="h-4 w-4" />} tone="destructive" />
          </div>

          {/* Aging por faixa — também funciona como filtro da tabela. */}
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Aging por faixa de atraso</h2>
          <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <button
              onClick={() => setFilter('')}
              className={cn(
                'rounded-xl border bg-card p-4 text-left transition-colors',
                filter === '' ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/40',
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">Todas</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{brl(data.total)}</p>
              <p className="text-xs text-muted-foreground">{data.totalCount} parcelas</p>
            </button>
            {data.buckets.map((b) => (
              <button
                key={b.key}
                onClick={() => setFilter(b.key)}
                disabled={b.count === 0}
                className={cn(
                  'rounded-xl border bg-card p-4 text-left transition-colors disabled:opacity-50',
                  filter === b.key ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/40',
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
                <p className={cn('mt-1 text-lg font-semibold tabular-nums', BUCKET_TONE[b.key] === 'destructive' ? 'text-destructive' : 'text-warning-strong')}>{brl(b.total)}</p>
                <p className="text-xs text-muted-foreground">{b.count} parcelas</p>
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Por paciente</h2>
            <div className="flex items-center gap-3">
              {filter && (
                <button onClick={() => setFilter('')} className="text-xs font-medium text-primary hover:underline">Limpar filtro</button>
              )}
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="mr-1.5 h-4 w-4" />Exportar CSV
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Nenhum paciente nesta faixa" description="Selecione outra faixa de atraso." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="px-4 py-3 font-medium text-right">Parcelas</th>
                    <th className="px-4 py-3 font-medium text-right">Atraso máx.</th>
                    <th className="px-4 py-3 font-medium">Faixas</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo em atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((p) => (
                    <tr key={p.patientId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/pacientes/${p.patientId}`} className="font-medium text-primary hover:underline">
                          {p.patientName || 'Paciente'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{p.count}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{p.oldestDays}d</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(p.buckets) as BucketKey[])
                            .filter((k) => p.buckets[k] > 0)
                            .map((k) => (
                              <StatusBadge key={k} tone={BUCKET_TONE[k]} dot={false}>{BUCKET_SHORT[k]}</StatusBadge>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">{brl(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
