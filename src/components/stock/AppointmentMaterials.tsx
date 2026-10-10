'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Package, Plus, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { FilterSelect } from '@/components/ui/filter-bar'
import { isExpired } from '@/lib/stock-caps'
import { Check, ControlledBadge, ControlledNote, apiSend, fmtDate, fmtQty, useLookups } from './shared'

type Proposed = {
  itemId: string; kitId: string | null; quantity: number; variable: boolean; optional: boolean; name: string; baseUnit: string
  isControlled: boolean; controlledList: string | null; controlledNote: string | null; tracksPatient: boolean; availableHere: number
  suggestedLot: { lotId: string; lotNumber: string; expiresAt: string | null } | null
  lots: { lotId: string; lotNumber: string; expiresAt: string | null; status: string; quantity: number }[]
  alreadyConsumed: number
}
type Panel = {
  appointment: { id: string; type: string; status: string; patientName: string | null; professionalName: string | null }
  canAct: boolean; canReverseControlled: boolean; mode: 'AUTOMATICA' | 'CONFIRMADA'
  usage: { status: 'PENDENTE' | 'CONFIRMADO' | 'AUTOMATICO'; confirmedAt: string | null } | null
  suggestedKitId: string | null; kitIds: string[]; kits: { id: string; name: string; appointmentType: string | null }[]
  location: { id: string; name: string } | null
  proposed: Proposed[]
  movements: { id: string; itemId: string; quantity: number; reversedAt: string | null; occurredAt: string; snapshot: any }[]
}
type LineState = { checked: boolean; quantity: string; lotId: string; reason: string; ack: boolean }
type Extra = { key: string; itemId: string; quantity: string }

const USAGE_LABEL = {
  PENDENTE: { label: 'Materiais a conferir', tone: 'warning' as const },
  CONFIRMADO: { label: 'Materiais conferidos', tone: 'success' as const },
  AUTOMATICO: { label: 'Baixa automática feita', tone: 'info' as const },
}
const toNum = (s: string) => Number(String(s).replace(',', '.')) || 0

/**
 * Painel "Materiais utilizados" do atendimento (Estoque, Fase 3). Some inteiro
 * quando o estoque não responde (módulo desligado / sem acesso) ou quando o
 * atendimento ainda não foi realizado e nada foi baixado.
 */
export function AppointmentMaterials({ appointmentId, appointmentStatus }: { appointmentId: string; appointmentStatus: string }) {
  const { lookups } = useLookups()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [hidden, setHidden] = useState(false)
  const [kitIds, setKitIds] = useState<string[] | null>(null)
  const [locationId, setLocationId] = useState('')
  const [lines, setLines] = useState<Record<string, LineState>>({})
  const [extras, setExtras] = useState<Extra[]>([])
  const [catalog, setCatalog] = useState<{ id: string; name: string; baseUnit: string; isControlled: boolean }[]>([])
  const [region, setRegion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<{ itemId: string; ok: boolean; error?: string }[]>([])

  const load = useCallback(async (ids?: string[] | null) => {
    const qs = ids ? `?kitIds=${ids.join(',')}` : ''
    const res = await fetch(`/api/estoque/appointments/${appointmentId}/usage${qs}`, { cache: 'no-store' })
    if (!res.ok) { setHidden(true); return }
    const d: Panel = await res.json()
    setHidden(false)
    setPanel(d)
    setLocationId((cur) => cur || d.location?.id || '')
    setLines(Object.fromEntries(d.proposed.map((p) => [p.itemId, {
      checked: !p.optional && p.quantity > 0, quantity: p.quantity > 0 ? String(p.quantity) : '', lotId: '', reason: '', ack: false,
    }])))
  }, [appointmentId])

  useEffect(() => { load(kitIds) }, [load, kitIds, appointmentStatus])
  useEffect(() => {
    fetch('/api/estoque/items').then((r) => (r.ok ? r.json() : [])).then((d) => setCatalog(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const consumed = useMemo(() => (panel?.movements ?? []), [panel])
  if (hidden || !panel) return null
  const attended = panel.appointment.status === 'ATTENDED'
  if (!attended && consumed.length === 0) return null

  const confirmed = panel.usage?.status === 'CONFIRMADO'
  const needsRegion = panel.proposed.some((p) => p.tracksPatient && lines[p.itemId]?.checked) || extras.length > 0
  const setLine = (itemId: string, patch: Partial<LineState>) => setLines((l) => ({ ...l, [itemId]: { ...l[itemId], ...patch } }))

  async function submit(noneUsed = false) {
    setError(null); setResults([])
    const payload = noneUsed ? [] : [
      ...panel!.proposed.filter((p) => lines[p.itemId]?.checked && toNum(lines[p.itemId].quantity) > 0).map((p) => ({
        itemId: p.itemId, kitId: p.kitId, quantity: toNum(lines[p.itemId].quantity), lotId: lines[p.itemId].lotId || null,
        reason: lines[p.itemId].reason || null, ackControlledNote: lines[p.itemId].ack,
      })),
      ...extras.filter((x) => x.itemId && toNum(x.quantity) > 0).map((x) => ({ itemId: x.itemId, quantity: toNum(x.quantity) })),
    ]
    if (!locationId) return setError('Escolha o local de onde saiu o material')
    for (const p of panel!.proposed) {
      const l = lines[p.itemId]
      if (!noneUsed && l?.checked && p.isControlled) {
        if (l.reason.trim().length < 3) return setError(`${p.name} é controlado: escreva a justificativa`)
        if (p.controlledNote && !l.ack) return setError(`Confirme que leu a observação de ${p.name}`)
      }
    }
    setBusy(true)
    const res = await apiSend(`/api/estoque/appointments/${appointmentId}/usage`, 'POST', {
      locationId, kitIds: panel!.kitIds, region: region || null, lines: payload, add: confirmed,
    })
    setBusy(false)
    if (!res.ok) return setError(res.data?.error || 'Não foi possível registrar')
    const r = res.data.results as { itemId: string; ok: boolean; error?: string }[]
    setResults(r.filter((x) => !x.ok))
    setExtras([])
    load(kitIds)
  }

  async function reverse(movementId: string, itemName: string) {
    const reason = window.prompt(`Estornar a baixa de ${itemName}? O material volta ao estoque.\n\nMotivo:`)
    if (reason === null) return
    if (reason.trim().length < 3) return setError('Informe o motivo')
    const res = await apiSend(`/api/estoque/appointments/${appointmentId}/usage/reverse`, 'POST', { movementId, reason: reason.trim() })
    if (!res.ok) return setError(res.data?.error || 'Não foi possível estornar')
    load(kitIds)
  }

  const usageMeta = panel.usage ? USAGE_LABEL[panel.usage.status] : null
  const pendingLines = panel.proposed.filter((p) => p.quantity > 0)

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h4 className="text-sm font-semibold">Materiais utilizados</h4>
        {usageMeta && <StatusBadge tone={usageMeta.tone}>{usageMeta.label}</StatusBadge>}
        <span className="text-xs text-muted-foreground">
          {panel.mode === 'AUTOMATICA' ? 'Baixa automática pelo kit' : 'Baixa conferida'}
        </span>
      </div>

      {consumed.length > 0 && (
        <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
          {consumed.map((m) => {
            const s = m.snapshot ?? {}
            const reversed = !!m.reversedAt
            const canReverse = panel.canAct && !reversed && (!s.controlled || panel.canReverseControlled)
            return (
              <li key={m.id} className={`flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${reversed ? 'text-muted-foreground' : ''}`}>
                <span className={reversed ? 'line-through' : ''}>
                  {s.itemName} · lote {s.lotNumber}{s.expiresAt ? ` (val. ${fmtDate(s.expiresAt)})` : ''} — <strong>{fmtQty(Math.abs(m.quantity))} {s.baseUnit}</strong>
                  {s.consumptionMode === 'AUTOMATICA' && <span className="ml-1 text-xs text-muted-foreground">(automática)</span>}
                  {s.controlled && <span className="ml-2"><ControlledBadge list={s.controlledList} /></span>}
                </span>
                {canReverse && (
                  <Button size="sm" variant="ghost" onClick={() => reverse(m.id, s.itemName)}><Undo2 className="mr-1 h-3.5 w-3.5" />Estornar</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!panel.canAct ? (
        <p className="text-sm text-muted-foreground">Você só dá baixa de materiais nos seus próprios atendimentos.</p>
      ) : !attended ? null : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Ficha técnica</span>
              <FilterSelect className="w-full" value="" onChange={(e) => e.target.value && setKitIds([...(panel.kitIds ?? []), e.target.value])}>
                <option value="">{panel.kitIds.length ? 'Adicionar outra ficha…' : 'Aplicar uma ficha…'}</option>
                {panel.kits.filter((k) => !panel.kitIds.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </FilterSelect>
              {panel.kitIds.length > 0 && (
                <span className="flex flex-wrap gap-1.5 pt-1">
                  {panel.kitIds.map((id) => (
                    <button key={id} type="button" onClick={() => setKitIds(panel.kitIds.filter((k) => k !== id))}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-destructive/10 hover:text-destructive" aria-label="Remover ficha">
                      {panel.kits.find((k) => k.id === id)?.name ?? 'ficha'} ×
                    </button>
                  ))}
                </span>
              )}
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Saiu de</span>
              <FilterSelect className="w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Selecione</option>
                {lookups?.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </FilterSelect>
            </label>
          </div>

          {pendingLines.length > 0 && (
            <ul className="space-y-2">
              {pendingLines.map((p) => {
                const l = lines[p.itemId] ?? { checked: false, quantity: '', lotId: '', reason: '', ack: false }
                return (
                  <li key={p.itemId} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <label className="flex min-h-[40px] flex-1 items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={l.checked} onChange={(e) => setLine(p.itemId, { checked: e.target.checked })} />
                        <span>
                          <span className="font-medium">{p.name}</span>
                          {p.variable && <span className="ml-1 text-xs text-muted-foreground">(quantidade na hora)</span>}
                          {p.optional && <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>}
                          <span className="block text-xs text-muted-foreground">
                            Disponível aqui: {fmtQty(p.availableHere)} {p.baseUnit}
                            {p.alreadyConsumed > 0 ? ` · já baixado: ${fmtQty(p.alreadyConsumed)}` : ''}
                          </span>
                        </span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input inputMode="decimal" className="w-24" value={l.quantity} onChange={(e) => setLine(p.itemId, { quantity: e.target.value })} aria-label={`Quantidade de ${p.name}`} />
                        <span className="text-sm text-muted-foreground">{p.baseUnit}</span>
                      </div>
                      <FilterSelect className="w-full sm:w-56" value={l.lotId} onChange={(e) => setLine(p.itemId, { lotId: e.target.value })} aria-label={`Lote de ${p.name}`}>
                        <option value="">{p.suggestedLot ? `Automático: ${p.suggestedLot.lotNumber}` : 'Automático (vence primeiro)'}</option>
                        {p.lots.map((lot) => (
                          <option key={lot.lotId} value={lot.lotId}>
                            {lot.lotNumber}{lot.expiresAt ? ` · val. ${fmtDate(lot.expiresAt)}` : ''} · {fmtQty(lot.quantity)}{isExpired(lot.expiresAt) ? ' · VENCIDO' : ''}
                          </option>
                        ))}
                      </FilterSelect>
                    </div>
                    {p.isControlled && l.checked && (
                      <div className="mt-3 space-y-2">
                        <ControlledNote list={p.controlledList} note={p.controlledNote} />
                        <Input placeholder="Justificativa (obrigatória)" value={l.reason} onChange={(e) => setLine(p.itemId, { reason: e.target.value })} />
                        {p.controlledNote && <Check checked={l.ack} onChange={(v) => setLine(p.itemId, { ack: v })}>Li a observação do controlado.</Check>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {extras.map((x) => (
            <div key={x.key} className="flex flex-wrap items-center gap-2">
              <FilterSelect className="min-w-0 flex-1" value={x.itemId} onChange={(e) => setExtras((xs) => xs.map((y) => (y.key === x.key ? { ...y, itemId: e.target.value } : y)))}>
                <option value="">Item…</option>
                {catalog.filter((c) => !c.isControlled).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </FilterSelect>
              <Input inputMode="decimal" className="w-24" placeholder="Qtd." value={x.quantity} onChange={(e) => setExtras((xs) => xs.map((y) => (y.key === x.key ? { ...y, quantity: e.target.value } : y)))} />
              <span className="text-sm text-muted-foreground">{catalog.find((c) => c.id === x.itemId)?.baseUnit}</span>
              <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setExtras((xs) => xs.filter((y) => y.key !== x.key))}>Remover</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExtras((xs) => [...xs, { key: `${Date.now()}`, itemId: '', quantity: '' }])}>
              <Plus className="mr-1 h-4 w-4" />Outro material
            </Button>
            <span className="self-center text-xs text-muted-foreground">Controlados entram pela ficha técnica, com justificativa.</span>
          </div>

          {needsRegion && (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Região de aplicação</span>
              <Input placeholder="Ex.: glabela e fronte" value={region} onChange={(e) => setRegion(e.target.value)} />
              <span className="block text-xs text-muted-foreground">Vai para o registro de aplicação no prontuário.</span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {results.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Alguns materiais não foram baixados:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">{results.map((r) => <li key={r.itemId}>{r.error}</li>)}</ul>
              <p className="mt-1 text-xs text-muted-foreground">O atendimento continua realizado e ficou com materiais a conferir. A gestão foi avisada quando faltou saldo.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => submit(false)} disabled={busy}>{busy ? 'Registrando…' : confirmed ? 'Acrescentar materiais' : 'Confirmar materiais'}</Button>
            {!confirmed && <Button size="sm" variant="outline" onClick={() => submit(true)} disabled={busy}>Nenhum material usado</Button>}
            <Link href="/estoque/fichas" className="self-center text-xs text-primary hover:underline">Fichas técnicas</Link>
          </div>
        </div>
      )}
    </div>
  )
}
