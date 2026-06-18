'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Ban, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { payableCan } from '@/lib/financial-caps'
import { brl, formatDate, RECEIVABLE_STATUS_LABELS, STATUS_TONE, PAYMENT_METHOD_LABELS } from '@/lib/financial-format'
import { PAYMENT_METHODS } from '@/lib/validations/financial'

export default function PayableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [role, setRole] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/me').then((r) => r.json()),
      fetch(`/api/financeiro/payables/${id}`).then((r) => r.json()),
    ]).then(([me, p]) => {
      setRole(me?.role || '')
      if (p?.error) setError(p.error); else setData(p)
    }).finally(() => setLoading(false))
  }, [id])
  useEffect(() => { load() }, [load])

  const canSettle = payableCan(role, 'settle')
  const canReverse = payableCan(role, 'reverse')
  const canCancel = payableCan(role, 'cancel')

  async function cancel() {
    const reason = window.prompt('Motivo do cancelamento:')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/financeiro/payables/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Erro') } else load()
  }
  async function reverse(paymentId: string) {
    const reason = window.prompt('Motivo do estorno:')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/financeiro/payable-payments/${paymentId}/reverse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || 'Erro') } else load()
  }

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-muted-foreground">Carregando…</div>
  if (error || !data) return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <p className="text-sm text-destructive">{error || 'Conta não encontrada'}</p>
      <Link href="/financeiro/pagar" className="mt-3 inline-block text-sm text-primary hover:underline">← Voltar</Link>
    </div>
  )

  const canceled = data.status === 'CANCELADO'
  const open = data.status !== 'PAGO' && !canceled

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/financeiro/pagar" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{data.supplierName || 'Despesa'}</h1>
            <StatusBadge tone={STATUS_TONE[data.displayStatus]}>{RECEIVABLE_STATUS_LABELS[data.displayStatus] || data.displayStatus}</StatusBadge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
          <p className="mt-2 text-sm">
            Total <strong>{brl(data.finalAmount)}</strong>
            {data.discountAmount > 0 && <span className="text-muted-foreground"> (desconto {brl(data.discountAmount)})</span>}
            {' · '}Pago <strong className="text-success">{brl(data.paidAmount)}</strong>{' · '}Saldo <strong>{brl(data.balance)}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Venc. {formatDate(data.dueDate)}
            {data.categoryName && ` · ${data.categoryName}`}{data.costCenterName && ` · ${data.costCenterName}`}
          </p>
          {canceled && <p className="mt-2 text-sm text-destructive">Cancelado: {data.canceledReason}</p>}
        </div>
        {canCancel && !canceled && (
          <Button variant="destructive" size="sm" onClick={cancel}><Ban className="mr-1.5 h-4 w-4" /> Cancelar</Button>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Pagamentos</h2>
      <div className="rounded-xl border border-border bg-card p-4">
        {data.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.payments.map((p: any) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className={p.reversedAt ? 'text-muted-foreground line-through' : ''}>
                  {brl(p.amount)} · {PAYMENT_METHOD_LABELS[p.method] || p.method} · {formatDate(p.paidAt)}
                </span>
                {p.reversedAt ? <span className="text-xs text-destructive">estornado</span>
                  : canReverse && !canceled ? (
                    <button onClick={() => reverse(p.id)} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"><Undo2 className="h-3 w-3" /> estornar</button>
                  ) : null}
              </li>
            ))}
          </ul>
        )}

        {open && canSettle && (
          paying ? (
            <PayablePaymentForm payableId={id} maxAmount={data.balance} onDone={() => { setPaying(false); load() }} onCancel={() => setPaying(false)} />
          ) : (
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setPaying(true)}>Registrar pagamento</Button>
          )
        )}
      </div>
    </div>
  )
}

function PayablePaymentForm({ payableId, maxAmount, onDone, onCancel }: { payableId: string; maxAmount: number; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(Number(maxAmount.toFixed(2)))
  const [method, setMethod] = useState('TRANSFERENCIA')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = Number.isFinite(amount) && amount > 0 && amount <= Number(maxAmount.toFixed(2))

  async function submit() {
    if (!valid) { setErr('Valor deve ser maior que zero e até o saldo'); return }
    setBusy(true); setErr(null)
    const res = await fetch(`/api/financeiro/payables/${payableId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, method, paidAt }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Erro'); return }
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
