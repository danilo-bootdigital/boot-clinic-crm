'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Receipt as ReceiptIcon, Ban, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { financialCan } from '@/lib/financial-caps'
import { printReceipt } from '@/components/financial/receipt'
import {
  brl, formatDate, RECEIVABLE_STATUS_LABELS, INSTALLMENT_STATUS_LABELS,
  STATUS_TONE, PAYMENT_METHOD_LABELS,
} from '@/lib/financial-format'
import { PAYMENT_METHODS } from '@/lib/validations/financial'

export default function ReceivableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [role, setRole] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<string | null>(null) // installmentId aberto p/ baixa

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch(`/api/financeiro/receivables/${id}`).then((r) => r.json()),
    ])
      .then(([me, rec]) => {
        setRole(me?.role || '')
        if (rec?.error) setError(rec.error); else setData(rec)
      })
      .finally(() => setLoading(false))
  }, [id])
  useEffect(() => { load() }, [load])

  const canSettle = financialCan(role, 'settle')
  const canReverse = financialCan(role, 'reverse')
  const canCancel = financialCan(role, 'cancel')
  const canReceipt = financialCan(role, 'receipt')

  async function cancel() {
    const reason = window.prompt('Motivo do cancelamento:')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/financeiro/receivables/${id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Erro ao cancelar') } else load()
  }

  async function reverse(paymentId: string) {
    const reason = window.prompt('Motivo do estorno:')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/financeiro/payments/${paymentId}/reverse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Erro ao estornar') } else load()
  }

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground">Carregando…</div>
  if (error || !data) return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <p className="text-sm text-destructive">{error || 'Recebível não encontrado'}</p>
      <Link href="/financeiro" className="mt-3 inline-block text-sm text-primary hover:underline">← Voltar</Link>
    </div>
  )

  const canceled = data.status === 'CANCELADO'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/financeiro" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{data.patientName || 'Paciente'}</h1>
            <StatusBadge tone={STATUS_TONE[data.displayStatus]}>
              {RECEIVABLE_STATUS_LABELS[data.displayStatus] || data.displayStatus}
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
          <p className="mt-2 text-sm">
            Total <strong>{brl(data.finalAmount)}</strong>
            {data.discountAmount > 0 && <span className="text-muted-foreground"> (desconto {brl(data.discountAmount)})</span>}
            {' · '}Recebido <strong className="text-success">{brl(data.paidAmount)}</strong>
            {' · '}Saldo <strong>{brl(data.balance)}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Emissão {formatDate(data.issueDate)} · {data.installmentsCount}x</p>
          {canceled && <p className="mt-2 text-sm text-destructive">Cancelado: {data.canceledReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canReceipt && data.paidAmount > 0 && (
            <Button variant="outline" size="sm" onClick={() => printReceipt(data)}>
              <ReceiptIcon className="mr-1.5 h-4 w-4" /> Recibo
            </Button>
          )}
          {canCancel && !canceled && (
            <Button variant="destructive" size="sm" onClick={cancel}><Ban className="mr-1.5 h-4 w-4" /> Cancelar</Button>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Parcelas</h2>
      <div className="space-y-3">
        {data.installments.map((inst: any) => {
          const open = inst.status !== 'PAGO' && inst.status !== 'CANCELADO'
          const tone = inst.overdue ? 'VENCIDO' : inst.status
          return (
            <div key={inst.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Parcela {inst.number}</span>
                  <StatusBadge tone={STATUS_TONE[tone]}>{INSTALLMENT_STATUS_LABELS[tone] || tone}</StatusBadge>
                  <span className="text-sm text-muted-foreground">venc. {formatDate(inst.dueDate)}</span>
                </div>
                <div className="text-sm">
                  {brl(inst.amount)}{inst.paidAmount > 0 && <span className="text-success"> · pago {brl(inst.paidAmount)}</span>}
                </div>
              </div>

              {inst.payments.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  {inst.payments.map((p: any) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className={p.reversedAt ? 'text-muted-foreground line-through' : ''}>
                        {brl(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] || p.method} · {formatDate(p.paidAt)}
                      </span>
                      {p.reversedAt ? (
                        <span className="text-xs text-destructive">estornado</span>
                      ) : canReverse && !canceled ? (
                        <button onClick={() => reverse(p.id)} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
                          <Undo2 className="h-3 w-3" /> estornar
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {open && !canceled && canSettle && (
                payFor === inst.id ? (
                  <PaymentForm
                    installmentId={inst.id}
                    maxAmount={inst.amount - inst.paidAmount}
                    onDone={() => { setPayFor(null); load() }}
                    onCancel={() => setPayFor(null)}
                  />
                ) : (
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => setPayFor(inst.id)}>
                    Registrar pagamento
                  </Button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PaymentForm({ installmentId, maxAmount, onDone, onCancel }: {
  installmentId: string; maxAmount: number; onDone: () => void; onCancel: () => void
}) {
  const [amount, setAmount] = useState(Number(maxAmount.toFixed(2)))
  const [method, setMethod] = useState('DINHEIRO')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const valid = Number.isFinite(amount) && amount > 0 && amount <= Number(maxAmount.toFixed(2))

  async function submit() {
    if (!valid) { setErr('Valor deve ser maior que zero e até o saldo da parcela'); return }
    setBusy(true); setErr(null)
    const res = await fetch(`/api/financeiro/installments/${installmentId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, method, paidAt }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Erro ao registrar'); return }
    onDone()
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-4 sm:items-end">
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Valor</span>
        <Input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Forma</span>
        <select className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Data</span>
        <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy || !valid}>{busy ? '…' : 'Confirmar'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
      {err && <p className="text-sm text-destructive sm:col-span-4">{err}</p>}
    </div>
  )
}
