'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brl } from '@/lib/financial-format'
import { financialCan } from '@/lib/financial-caps'

interface Source {
  id: string
  patientId: string
  patientName: string | null
  title: string
  amount: number
  date: string | null
}
interface Category { id: string; name: string }

/**
 * Formulário inline para criar um recebível a partir de um Orçamento APROVADO,
 * um Contrato ASSINADO ou — para gestão/financeiro — uma cobrança MANUAL.
 *
 * Nas duas primeiras o valor é DERIVADO da origem (o campo fica travado, e o
 * servidor ignora o que vier no payload). Na manual não há origem de onde
 * derivar: o valor é digitado, e por isso a opção só aparece para quem tem
 * `create_manual`. Atendimento se fatura pela Agenda, não por aqui.
 */
export function NewReceivableForm({ onCreated, onCancel, role = '' }: {
  onCreated: () => void
  onCancel: () => void
  role?: string
}) {
  const [quotes, setQuotes] = useState<Source[]>([])
  const [contracts, setContracts] = useState<Source[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [originKey, setOriginKey] = useState('') // "quote:<id>" | "contract:<id>" | "manual"
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [patientId, setPatientId] = useState('')      // manual: paciente escolhido à mão
  const [manualAmount, setManualAmount] = useState(0) // manual: valor digitado
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([])
  const [discount, setDiscount] = useState(0)
  const [installmentsCount, setInstallmentsCount] = useState(1)
  const [firstDueDate, setFirstDueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [intervalDays, setIntervalDays] = useState(30)

  useEffect(() => {
    Promise.all([
      fetch('/api/financeiro/receivables/sources').then((r) => r.json()),
      fetch('/api/financeiro/categories').then((r) => r.json()),
    ])
      .then(([src, cats]) => {
        setQuotes(src.quotes || [])
        setContracts(src.contracts || [])
        setCategories(Array.isArray(cats) ? cats : [])
      })
      .catch(() => setError('Falha ao carregar origens'))
      .finally(() => setLoading(false))
  }, [])

  const canCreateManual = financialCan(role, 'create_manual')

  useEffect(() => {
    if (!canCreateManual) return
    fetch('/api/patients?limit=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = Array.isArray(d) ? d : d?.patients
        setPatients(Array.isArray(lista) ? lista.map((p: any) => ({ id: p.id, name: p.name })) : [])
      })
      .catch(() => {})
  }, [canCreateManual])

  const isManual = originKey === 'manual'
  const selected = isManual
    ? undefined
    : originKey.startsWith('quote:')
      ? quotes.find((q) => `quote:${q.id}` === originKey)
      : contracts.find((c) => `contract:${c.id}` === originKey)
  const original = isManual ? manualAmount : selected?.amount ?? 0
  const finalAmount = Math.max(0, original - discount)
  // Manual precisa de paciente + valor; as demais precisam da origem selecionada.
  const pronto = isManual ? !!patientId && manualAmount > 0 : !!selected

  async function submit() {
    if (!pronto) {
      setError(isManual ? 'Informe paciente e valor' : 'Selecione uma origem (orçamento ou contrato)')
      return
    }
    setSubmitting(true); setError(null)
    const isQuote = originKey.startsWith('quote:')
    const body = isManual
      ? {
          patientId,
          sourceType: 'MANUAL',
          categoryId: categoryId || undefined,
          description: description || 'Cobrança manual',
          originalAmount: manualAmount,
          discountAmount: discount,
          installmentsCount,
          firstDueDate,
          intervalDays,
        }
      : {
          patientId: selected!.patientId,
          sourceType: isQuote ? 'BUDGET' : 'CONTRACT',
          quoteId: isQuote ? selected!.id : undefined,
          contractId: isQuote ? undefined : selected!.id,
          categoryId: categoryId || undefined,
          description: description || selected!.title,
          originalAmount: original,
          discountAmount: discount,
          installmentsCount,
          firstDueDate,
          intervalDays,
        }
    const res = await fetch('/api/financeiro/receivables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Erro ao criar recebível')
      return
    }
    onCreated()
  }

  if (loading) return <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Carregando origens…</div>

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
      <h3 className="text-base font-semibold">Novo recebível</h3>
      {quotes.length === 0 && contracts.length === 0 && !canCreateManual ? (
        <p className="text-sm text-muted-foreground">
          Nenhum orçamento aprovado ou contrato assinado disponível. A receita nasce de uma dessas origens
          — ou do faturamento de um atendimento, pela Agenda.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Origem</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={originKey}
                onChange={(e) => setOriginKey(e.target.value)}
              >
                <option value="">Selecione…</option>
                {quotes.length > 0 && (
                  <optgroup label="Orçamentos aprovados">
                    {quotes.map((q) => (
                      <option key={q.id} value={`quote:${q.id}`}>
                        {q.patientName || 'Paciente'} · {q.title} · {brl(q.amount)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {contracts.length > 0 && (
                  <optgroup label="Contratos assinados">
                    {contracts.map((c) => (
                      <option key={c.id} value={`contract:${c.id}`}>
                        {c.patientName || 'Paciente'} · {c.title} · {brl(c.amount)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {canCreateManual && (
                  <optgroup label="Sem origem vinculada">
                    <option value="manual">Cobrança manual</option>
                  </optgroup>
                )}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Categoria</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— sem categoria —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          {isManual && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Paciente</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-sm font-medium">Descrição</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={selected?.title || 'Descrição da receita'} />
          </label>

          <div className="grid gap-4 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium">Valor original</span>
              {isManual ? (
                <Input
                  type="number" min={0.01} step="0.01" value={manualAmount || ''}
                  onChange={(e) => setManualAmount(Math.max(0, Number(e.target.value)))}
                />
              ) : (
                // Travado de propósito: o servidor deriva o valor da origem.
                <Input value={brl(original)} disabled />
              )}
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Desconto (R$)</span>
              <Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Parcelas</span>
              <Input type="number" min={1} max={120} value={installmentsCount} onChange={(e) => setInstallmentsCount(Math.max(1, Number(e.target.value)))} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Intervalo (dias)</span>
              <Input type="number" min={1} max={365} value={intervalDays} onChange={(e) => setIntervalDays(Math.max(1, Number(e.target.value)))} />
            </label>
          </div>
          <label className="block space-y-1 sm:max-w-[12rem]">
            <span className="text-sm font-medium">1º vencimento</span>
            <Input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
          </label>

          <p className="text-sm text-muted-foreground">
            Valor final: <strong className="text-foreground">{brl(finalAmount)}</strong>
            {installmentsCount > 1 && ` em ${installmentsCount}x de ~${brl(finalAmount / installmentsCount)}`}
          </p>
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={submitting || !pronto}>{submitting ? 'Salvando…' : 'Criar recebível'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
