'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Download } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'

const brl = (n: number) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const ORIGIN_LABELS: Record<string, string> = { GOOGLE: 'Google', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', REFERRAL: 'Indicação', WALK_IN: 'Passagem', PHONE: 'Telefone', WHATSAPP: 'WhatsApp', OTHER: 'Outros' }
const STATUS_LABELS: Record<string, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', CANCELED: 'Cancelado', RESCHEDULED: 'Remarcado', ATTENDED: 'Compareceu', NO_SHOW: 'Faltou' }

function firstOfMonth() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0] }

export default function RelatoriosPage() {
  const router = useRouter()
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/reports?from=${from}&to=${to}`, { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/relatorios'); return }
    if (res.status === 403) { setData('forbidden'); setLoading(false); return }
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [from, to, router])

  useEffect(() => { load() }, [load])

  function exportCsv() {
    if (!data || data === 'forbidden') return
    const rows: [string, string | number][] = [
      ['Período', `${data.period.from} a ${data.period.to}`],
      ['Pacientes novos', data.patients.newInPeriod],
      ['Pacientes ativos (total)', data.patients.activeTotal],
      ['Oportunidades criadas', data.crm.created],
      ['Oportunidades ganhas', data.crm.won],
      ['Oportunidades perdidas', data.crm.lost],
      ['Receita ganha', brl(data.crm.wonValue)],
      ['Taxa de conversão (%)', data.crm.conversionRate],
      ['Consultas no período', data.agenda.total],
      ['Consultas realizadas', data.agenda.attended],
      ['Taxa de comparecimento (%)', data.agenda.attendanceRate],
      ['Tarefas criadas', data.followup.created],
      ['Tarefas concluídas', data.followup.completed],
    ]
    const csv = ['Indicador;Valor', ...rows.map(([k, v]) => `${k};${v}`)].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `relatorio_${from}_a_${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Indicadores por período e exportação"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={data && data !== 'forbidden' ? <ActionButton icon={<Download />} variant="outline" onClick={exportCsv}>Exportar CSV</ActionButton> : undefined}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div><label className="block text-xs text-muted-foreground mb-1">De</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm" /></div>
        <div><label className="block text-xs text-muted-foreground mb-1">Até</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 border border-border rounded-md text-sm" /></div>
      </div>

      {loading ? <LoadingState rows={4} label="Gerando relatório" />
        : data === 'forbidden' ? <SectionCard><p className="text-sm text-muted-foreground">Você não tem permissão para ver relatórios.</p></SectionCard>
        : !data ? <SectionCard><p className="text-sm text-muted-foreground">Sem dados.</p></SectionCard>
        : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Pacientes novos" value={String(data.patients.newInPeriod)} hint="No período" tone="primary" />
              <StatCard label="Receita ganha" value={brl(data.crm.wonValue)} hint={`${data.crm.won} oportunidade(s)`} tone="success" />
              <StatCard label="Consultas realizadas" value={String(data.agenda.attended)} hint={`${data.agenda.total} no período`} tone="primary" />
              <StatCard label="Conversão CRM" value={`${data.crm.conversionRate}%`} hint="Ganhas / decididas" tone="warning" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard title="Pacientes" description="Aquisição no período">
                <div className="divide-y divide-border">
                  <Row label="Novos" value={data.patients.newInPeriod} />
                  <Row label="Ativos (total)" value={data.patients.activeTotal} />
                  {Object.entries(data.patients.byOrigin).map(([o, n]) => <Row key={o} label={`Origem: ${ORIGIN_LABELS[o] || o}`} value={n as number} />)}
                </div>
              </SectionCard>

              <SectionCard title="CRM" description="Oportunidades no período">
                <div className="divide-y divide-border">
                  <Row label="Criadas" value={data.crm.created} />
                  <Row label="Ganhas" value={data.crm.won} />
                  <Row label="Perdidas" value={data.crm.lost} />
                  <Row label="Receita ganha" value={brl(data.crm.wonValue)} />
                </div>
              </SectionCard>

              <SectionCard title="Agenda" description="Consultas no período">
                <div className="divide-y divide-border">
                  <Row label="Total" value={data.agenda.total} />
                  <Row label="Comparecimento" value={`${data.agenda.attendanceRate}%`} />
                  {Object.entries(data.agenda.byStatus).map(([s, n]) => <Row key={s} label={STATUS_LABELS[s] || s} value={n as number} />)}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Follow-up" description="Tarefas no período">
              <div className="divide-y divide-border">
                <Row label="Criadas" value={data.followup.created} />
                <Row label="Concluídas" value={data.followup.completed} />
              </div>
            </SectionCard>
          </>
        )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-sm font-medium text-muted-foreground">{value}</span>
    </div>
  )
}
