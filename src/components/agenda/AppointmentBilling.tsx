'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wallet, Plus, ExternalLink, FileText, CircleDollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilterSelect } from '@/components/ui/filter-bar'
import { StatusBadge } from '@/components/ui/status-badge'
import { financialCan } from '@/lib/financial-caps'
import {
  brl, formatDate, RECEIVABLE_STATUS_LABELS, STATUS_TONE, PAYMENT_METHOD_LABELS,
} from '@/lib/financial-format'
import { PAYMENT_METHODS } from '@/lib/validations/financial'
import type { Appointment } from './types'

interface Billing {
  billable: boolean
  receivables: any[]
  totals: { faturado: number; recebido: number; emAberto: number; count: number }
}

/** Data de hoje em YYYY-MM-DD (fuso local — `toISOString` devolveria UTC). */
function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Última baixa não estornada de uma cobrança — alimenta a linha "Pago · PIX · data". */
function ultimaBaixa(receivable: any) {
  const pagos = (receivable.installments ?? [])
    .flatMap((i: any) => i.payments ?? [])
    .filter((p: any) => !p.reversedAt)
  return pagos.length ? pagos[pagos.length - 1] : null
}

/**
 * Bloco Financeiro do agendamento realizado: mostra a situação da cobrança e
 * abre o faturamento direto da Agenda, sem passar por orçamento fictício.
 *
 * Some inteiro quando o Financeiro não responde (módulo desabilitado, usuário
 * sem permissão) — a Agenda continua funcionando como antes.
 */
export function AppointmentBilling({ appointment, role }: { appointment: Appointment; role: string }) {
  const router = useRouter()
  const [data, setData] = useState<Billing | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)
  const [form, setForm] = useState<'none' | 'invoice' | 'invoice_settle'>('none')
  const [adicional, setAdicional] = useState(false)

  const canCreate = financialCan(role, 'create')
  const canSettle = financialCan(role, 'settle')

  const load = useCallback(async () => {
    const res = await fetch(`/api/agenda/appointments/${appointment.id}/billing`, { cache: 'no-store' })
    if (!res.ok) { setIndisponivel(true); return }
    setIndisponivel(false)
    setData(await res.json())
  }, [appointment.id])

  useEffect(() => { load() }, [load])

  if (indisponivel || !data) return null

  const ativos = data.receivables.filter((r: any) => r.status !== 'CANCELADO')
  const temCobranca = ativos.length > 0
  // Agendamento ainda não realizado e sem cobrança: nada a mostrar. O bloco só
  // aparece quando há o que faturar ou o que prestar contas.
  if (!data.billable && !temCobranca) return null

  function abrirFaturamento(modo: 'invoice' | 'invoice_settle', extra: boolean) {
    setAdicional(extra)
    setForm(modo)
  }

  function gerarOrcamento() {
    // Continua no fluxo comercial existente (aba Orçamentos do paciente),
    // só pré-preenchendo o que a Agenda já sabe.
    const qs = new URLSearchParams({
      tab: 'orcamentos',
      novo: '1',
      titulo: appointment.type || 'Atendimento',
      item: appointment.type || 'Atendimento',
    })
    router.push(`/pacientes/${appointment.patientId}?${qs}`)
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" /> Financeiro
      </h3>

      {temCobranca ? (
        <div className="mt-3 space-y-3">
          {ativos.map((r: any) => {
            const baixa = ultimaBaixa(r)
            return (
              <div key={r.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{brl(r.finalAmount)}</p>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <StatusBadge tone={STATUS_TONE[r.displayStatus]}>
                    {RECEIVABLE_STATUS_LABELS[r.displayStatus] || r.displayStatus}
                  </StatusBadge>
                </div>
                {baixa && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[baixa.method] || baixa.method} · {formatDate(baixa.paidAt)}
                  </p>
                )}
                {r.balance > 0 && r.paidAmount > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Recebido {brl(r.paidAmount)} · saldo {brl(r.balance)}
                  </p>
                )}
                <Link
                  href={`/financeiro/${r.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Ver no Financeiro
                </Link>
              </div>
            )
          })}

          <p className="text-xs text-muted-foreground">Este atendimento já possui uma cobrança.</p>

          {canCreate && data.billable && form === 'none' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push(`/financeiro/${ativos[0].id}`)}>
                Abrir cobrança
              </Button>
              {/* Cobrança adicional nunca é automática: exige este clique. */}
              <Button variant="ghost" size="sm" onClick={() => abrirFaturamento('invoice', true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Criar cobrança adicional
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma cobrança para este atendimento.</p>
      )}

      {!temCobranca && data.billable && canCreate && form === 'none' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => abrirFaturamento('invoice', false)}>
            <CircleDollarSign className="mr-1.5 h-4 w-4" /> Faturar atendimento
          </Button>
          {canSettle && (
            <Button variant="outline" size="sm" onClick={() => abrirFaturamento('invoice_settle', false)}>
              Faturar e receber
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={gerarOrcamento}>
            <FileText className="mr-1.5 h-4 w-4" /> Gerar orçamento
          </Button>
        </div>
      )}

      {form !== 'none' && (
        <BillingForm
          appointment={appointment}
          comBaixa={form === 'invoice_settle'}
          adicional={adicional}
          onDone={() => { setForm('none'); load() }}
          onCancel={() => setForm('none')}
        />
      )}
    </div>
  )
}

/**
 * Formulário de faturamento pré-preenchido com o que a Agenda já sabe.
 * Descrição e valor são editáveis antes de confirmar (o atendimento não tem
 * preço cadastrado — o valor é sempre uma decisão de quem fatura).
 */
function BillingForm({ appointment, comBaixa, adicional, onDone, onCancel }: {
  appointment: Appointment
  comBaixa: boolean
  adicional: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [description, setDescription] = useState(
    [appointment.type, appointment.professional?.name].filter(Boolean).join(' · ') || 'Atendimento',
  )
  const [amount, setAmount] = useState<number>(0)
  const [dueDate, setDueDate] = useState(hoje())
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [method, setMethod] = useState('DINHEIRO')
  const [paidAt, setPaidAt] = useState(hoje())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // O valor recebido acompanha o faturado enquanto o usuário não o edita à mão.
  const [recebidoTocado, setRecebidoTocado] = useState(false)
  const valorRecebido = recebidoTocado ? paidAmount : amount

  const valido =
    description.trim().length > 0 &&
    Number.isFinite(amount) && amount > 0 &&
    (!comBaixa || (Number.isFinite(valorRecebido) && valorRecebido > 0 && valorRecebido <= amount))

  async function submit() {
    if (!valido) { setErr('Preencha descrição e valor (o recebido não pode passar do faturado).'); return }
    setBusy(true); setErr(null)
    const res = await fetch(`/api/agenda/appointments/${appointment.id}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: description.trim(),
        amount,
        dueDate,
        allowDuplicate: adicional,
        ...(comBaixa ? { payment: { amount: valorRecebido, method, paidAt } } : {}),
      }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error || 'Falha ao faturar o atendimento')
      return
    }
    onDone()
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">
        {comBaixa ? 'Faturar e receber' : adicional ? 'Nova cobrança para este atendimento' : 'Faturar atendimento'}
      </p>

      {/* Contexto pré-preenchido, não editável: é o vínculo da cobrança. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Paciente</dt><dd className="font-medium">{appointment.patient?.name || '—'}</dd></div>
        <div><dt className="text-muted-foreground">Atendimento</dt><dd className="font-medium">{formatDate(appointment.startAt)}</dd></div>
        <div><dt className="text-muted-foreground">Profissional</dt><dd className="font-medium">{appointment.professional?.name || '—'}</dd></div>
        <div><dt className="text-muted-foreground">Procedimento</dt><dd className="font-medium">{appointment.type || '—'}</dd></div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Descrição</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Valor</span>
          <Input type="number" min={0.01} step="0.01" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Vencimento</span>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>

      {comBaixa && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Valor recebido</span>
            <Input
              type="number" min={0.01} step="0.01" value={valorRecebido || ''}
              onChange={(e) => { setRecebidoTocado(true); setPaidAmount(Number(e.target.value)) }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Forma de pagamento</span>
            <FilterSelect className="w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </FilterSelect>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Data do pagamento</span>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy || !valido}>
          {busy ? '…' : comBaixa ? 'Faturar e receber' : 'Faturar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
