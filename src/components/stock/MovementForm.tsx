'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'
import { LOSS_REASONS, LOSS_REASON_LABELS, isExpired } from '@/lib/stock-caps'
import { Check, ControlledNote, Field, apiSend, fmtDate, fmtQty, type Lookups } from './shared'

export type Operation = 'ENTRADA' | 'CONSUMO' | 'PERDA' | 'AJUSTE' | 'TRANSFERENCIA'

export const OPERATION_LABELS: Record<Operation, string> = {
  ENTRADA: 'Entrada',
  CONSUMO: 'Consumo interno',
  PERDA: 'Perda',
  AJUSTE: 'Ajuste',
  TRANSFERENCIA: 'Transferência',
}

type Balance = { locationId: string; locationName: string; lotId: string; lotNumber: string; expiresAt: string | null; lotStatus: string; quantity: number }
type Lot = { id: string; lotNumber: string; expiresAt: string | null; status: string; quantity: number }
type ItemDetail = { item: Record<string, any>; balances: Balance[]; lots: Lot[] }
type Alternative = { locationName: string; lotNumber: string; expiresAt: string | null; quantity: number; lotStatus: string | null }

const toNum = (s: string) => Number(s.replace(',', '.'))

// Formulário único das movimentações da Fase 1. O servidor é quem decide
// (saldo, lote, validade, controlados); aqui só se guia o usuário e se mostra
// a recusa com as saídas possíveis (outro lote/local).
export function MovementForm({ operation, itemId: initialItemId, locationId: initialLocationId, lotId: initialLotId, lookups, canViewCost, onDone, onCancel }: {
  operation: Operation
  itemId?: string
  locationId?: string
  lotId?: string
  lookups: Lookups | null
  canViewCost: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [items, setItems] = useState<{ id: string; name: string; baseUnit: string; isControlled: boolean }[]>([])
  const [itemFilter, setItemFilter] = useState('')
  const [itemId, setItemId] = useState(initialItemId || '')
  const [detail, setDetail] = useState<ItemDetail | null>(null)

  const [entryType, setEntryType] = useState('ENTRADA_AVULSA')
  const [locationId, setLocationId] = useState(initialLocationId || '')
  const [toLocationId, setToLocationId] = useState('')
  const [lotId, setLotId] = useState(initialLotId || '')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<'base' | 'purchase'>('base')
  const [unitCost, setUnitCost] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT')
  const [lossReason, setLossReason] = useState('VENCIMENTO')
  const [reason, setReason] = useState('')
  const [patientQuery, setPatientQuery] = useState('')
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([])
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null)
  const [professionalId, setProfessionalId] = useState('')
  const [ack, setAck] = useState(false)
  const [confirmTemp, setConfirmTemp] = useState(false)
  const [needsTempConfirm, setNeedsTempConfirm] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [noBalance, setNoBalance] = useState(false)

  useEffect(() => {
    if (initialItemId) return
    fetch('/api/estoque/items').then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : [])).catch(() => {})
  }, [initialItemId])

  useEffect(() => {
    if (!itemId) { setDetail(null); return }
    fetch(`/api/estoque/items/${itemId}`).then((r) => r.json()).then((d) => setDetail(d?.item ? d : null)).catch(() => {})
  }, [itemId])

  // Busca de paciente (só id/nome) com debounce leve.
  useEffect(() => {
    if (patient || patientQuery.trim().length < 2) { setPatients([]); return }
    const t = setTimeout(() => {
      fetch(`/api/estoque/lookups/patients?q=${encodeURIComponent(patientQuery)}`).then((r) => r.json()).then((d) => setPatients(Array.isArray(d) ? d : [])).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery, patient])

  const item = detail?.item
  const baseUnit = item?.baseUnit || ''
  const controlled = !!item?.isControlled
  const needsPatient = !!(item?.tracksPatient || controlled)
  const isExit = operation === 'CONSUMO' || operation === 'PERDA' || operation === 'TRANSFERENCIA' || (operation === 'AJUSTE' && direction === 'OUT')

  // Locais elegíveis: na entrada, controlado só em guarda de controlados; nas
  // saídas, só locais onde o item tem saldo.
  const allLocations = lookups?.locations ?? []
  const entryLocations = controlled ? allLocations.filter((l) => l.controlledStorage) : allLocations
  const balanceLocations = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; qty: number }>()
    for (const b of detail?.balances ?? []) {
      const cur = seen.get(b.locationId) ?? { id: b.locationId, name: b.locationName, qty: 0 }
      cur.qty += b.quantity
      seen.set(b.locationId, cur)
    }
    return Array.from(seen.values())
  }, [detail])

  const locationOptions = operation === 'ENTRADA' || (operation === 'AJUSTE' && direction === 'IN') ? entryLocations.map((l) => ({ id: l.id, name: l.name, qty: null as number | null })) : balanceLocations

  useEffect(() => {
    // Pré-seleção: local padrão na entrada; primeiro local com saldo nas saídas.
    if (locationId && locationOptions.some((l) => l.id === locationId)) return
    const def = operation === 'ENTRADA' ? entryLocations.find((l) => l.isDefault) ?? entryLocations[0] : null
    setLocationId(def?.id ?? locationOptions[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, operation, direction, lookups])

  const lotsHere = (detail?.balances ?? []).filter((b) => b.locationId === locationId)
  const selectedBalance = lotId ? lotsHere.find((b) => b.lotId === lotId) : null
  const availableHere = selectedBalance ? selectedBalance.quantity : lotsHere.reduce((s, b) => s + b.quantity, 0)
  const lotRequired = operation === 'PERDA' || operation === 'AJUSTE'
  const lotChoices: { id: string; label: string }[] = operation === 'AJUSTE' && direction === 'IN'
    ? (detail?.lots ?? []).map((l) => ({ id: l.id, label: `${l.lotNumber}${l.expiresAt ? ` · val. ${fmtDate(l.expiresAt)}` : ''}` }))
    : lotsHere.map((b) => ({
        id: b.lotId,
        label: `${b.lotNumber}${b.expiresAt ? ` · val. ${fmtDate(b.expiresAt)}` : ''} · ${fmtQty(b.quantity)} ${baseUnit}${isExpired(b.expiresAt) ? ' · VENCIDO' : ''}${b.lotStatus !== 'LIBERADO' ? ` · ${b.lotStatus}` : ''}`,
      }))

  async function submit() {
    setError(null)
    setAlternatives([])
    setNoBalance(false)
    const q = toNum(quantity)
    if (!itemId) return setError('Escolha o item')
    if (!(q > 0)) return setError('Informe a quantidade')
    if (!locationId) return setError(operation === 'TRANSFERENCIA' ? 'Escolha a origem' : 'Escolha o local')
    if (lotRequired && !lotId) return setError('Escolha o lote')
    if (operation === 'CONSUMO' && needsPatient && !patient) return setError('Informe o paciente')
    if (operation === 'CONSUMO' && controlled && item?.controlledNote && !ack) return setError('Confirme que leu a observação do controlado')

    let body: Record<string, unknown>
    switch (operation) {
      case 'ENTRADA':
        body = {
          operation, type: entryType, itemId, locationId, quantity: q, unit,
          unitCost: canViewCost && unitCost.trim() ? toNum(unitCost) : null,
          lotNumber: lotNumber || null, expiresAt: expiresAt || null, supplierId: supplierId || null,
          reason: reason || null, confirmTemperature: confirmTemp,
        }
        break
      case 'CONSUMO':
        body = {
          operation, itemId, locationId, lotId: lotId || null, quantity: q,
          patientId: patient?.id ?? null, professionalId: professionalId || null, reason: reason || null, ackControlledNote: ack,
        }
        break
      case 'PERDA':
        body = { operation, itemId, locationId, lotId, quantity: q, lossReason, reason: reason || null }
        break
      case 'AJUSTE':
        body = { operation, itemId, locationId, lotId, direction, quantity: q, reason }
        break
      case 'TRANSFERENCIA':
        if (!toLocationId) return setError('Escolha o destino')
        body = { operation, itemId, fromLocationId: locationId, toLocationId, lotId: lotId || null, quantity: q, reason: reason || null, confirmTemperature: confirmTemp }
        break
    }
    setSaving(true)
    const res = await apiSend('/api/estoque/movements', 'POST', body)
    setSaving(false)
    if (res.ok) return onDone()
    if (res.data?.code === 'TEMPERATURE_CONFIRM') setNeedsTempConfirm(true)
    if (res.data?.code === 'NO_BALANCE') { setNoBalance(true); setAlternatives(res.data.alternatives ?? []) }
    setError(res.data?.error || 'Não foi possível registrar')
  }

  const destOptions = (controlled ? allLocations.filter((l) => l.controlledStorage) : allLocations).filter((l) => l.id !== locationId)

  return (
    <div className="space-y-5">
      {!initialItemId && (
        <Field label="Item" required>
          <Input placeholder="Filtrar itens…" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="mb-2" />
          <FilterSelect className="w-full" value={itemId} onChange={(e) => { setItemId(e.target.value); setLotId(''); setAck(false) }}>
            <option value="">Selecione</option>
            {items
              .filter((i) => !itemFilter || i.name.toLowerCase().includes(itemFilter.toLowerCase()))
              .map((i) => <option key={i.id} value={i.id}>{i.name}{i.isControlled ? ' · CONTROLADO' : ''}</option>)}
          </FilterSelect>
        </Field>
      )}

      {item && initialItemId && <p className="text-sm font-medium">{item.name}</p>}
      {controlled && <ControlledNote list={item?.controlledList} note={item?.controlledNote} />}

      {item && (
        <>
          {operation === 'ENTRADA' && (
            <Field label="Tipo de entrada" required hint={entryType === 'ENTRADA_AVULSA' ? 'Saldo inicial ou compra já lançada no financeiro. Compra com nota é pelo Recebimento.' : undefined}>
              <FilterSelect className="w-full" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
                <option value="ENTRADA_AVULSA">Entrada avulsa / saldo inicial</option>
                <option value="ENTRADA_BONIFICACAO">Bonificação / amostra do fornecedor</option>
                <option value="ENTRADA_DEVOLUCAO">Devolução ao estoque</option>
              </FilterSelect>
            </Field>
          )}

          {operation === 'AJUSTE' && (
            <Field label="Ajuste" required>
              <FilterSelect className="w-full" value={direction} onChange={(e) => { setDirection(e.target.value as 'IN' | 'OUT'); setLotId('') }}>
                <option value="OUT">Saída (falta no físico)</option>
                <option value="IN">Entrada (sobra no físico)</option>
              </FilterSelect>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={operation === 'TRANSFERENCIA' ? 'Origem' : 'Local'} required>
              <FilterSelect className="w-full" value={locationId} onChange={(e) => { setLocationId(e.target.value); setLotId('') }}>
                <option value="">Selecione</option>
                {locationOptions.map((l) => <option key={l.id} value={l.id}>{l.name}{l.qty != null ? ` · ${fmtQty(l.qty)} ${baseUnit}` : ''}</option>)}
              </FilterSelect>
              {isExit && locationOptions.length === 0 && <span className="block text-xs text-destructive">Sem saldo em nenhum local.</span>}
              {operation === 'ENTRADA' && controlled && entryLocations.length === 0 && (
                <span className="block text-xs text-destructive">Nenhum local de guarda de controlados. Cadastre em Configurações.</span>
              )}
            </Field>
            {operation === 'TRANSFERENCIA' && (
              <Field label="Destino" required>
                <FilterSelect className="w-full" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                  <option value="">Selecione</option>
                  {destOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </FilterSelect>
              </Field>
            )}
          </div>

          {operation !== 'ENTRADA' && (
            <Field label="Lote" required={lotRequired} hint={!lotRequired ? 'Automático = o que vence primeiro (FEFO).' : undefined}>
              <FilterSelect className="w-full" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                <option value="">{lotRequired ? 'Selecione' : 'Automático (vence primeiro)'}</option>
                {lotChoices.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </FilterSelect>
            </Field>
          )}

          {operation === 'ENTRADA' && item.tracksLot && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lote" required>
                <Input list="stock-lots" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Nº do lote do fabricante" />
                <datalist id="stock-lots">{detail?.lots.map((l) => <option key={l.id} value={l.lotNumber} />)}</datalist>
              </Field>
              {item.tracksExpiry && (
                <Field label="Validade" required={!detail?.lots.some((l) => l.lotNumber === lotNumber)}>
                  <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </Field>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantidade" required hint={isExit && locationId ? `Disponível: ${fmtQty(availableHere)} ${baseUnit}` : undefined}>
              <div className="flex gap-2">
                <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                {operation === 'ENTRADA' && item.purchaseUnit ? (
                  <FilterSelect value={unit} onChange={(e) => setUnit(e.target.value as 'base' | 'purchase')} aria-label="Unidade">
                    <option value="base">{baseUnit}</option>
                    <option value="purchase">{item.purchaseUnit} ({fmtQty(item.conversionFactor)} {baseUnit})</option>
                  </FilterSelect>
                ) : (
                  <span className="grid h-10 shrink-0 place-items-center px-1 text-sm text-muted-foreground">{baseUnit}</span>
                )}
              </div>
            </Field>
            {operation === 'ENTRADA' && canViewCost && entryType !== 'ENTRADA_DEVOLUCAO' && (
              <Field label={`Custo por ${unit === 'purchase' ? item.purchaseUnit : baseUnit} (R$)`} hint="Vazio = custo médio atual (bonificação: zero).">
                <Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              </Field>
            )}
          </div>

          {operation === 'ENTRADA' && entryType !== 'ENTRADA_DEVOLUCAO' && (
            <Field label="Fornecedor">
              <FilterSelect className="w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">—</option>
                {lookups?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </FilterSelect>
            </Field>
          )}

          {operation === 'CONSUMO' && (
            <div className="space-y-4">
              <Field label="Paciente" required={needsPatient} hint={needsPatient ? 'Este item só sai com o paciente informado.' : 'Opcional.'}>
                {patient ? (
                  <div className="flex h-10 items-center justify-between rounded-lg border border-input px-3 text-sm">
                    <span>{patient.name}</span>
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setPatient(null); setPatientQuery('') }}>Trocar</button>
                  </div>
                ) : (
                  <>
                    <Input placeholder="Buscar pelo nome…" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
                    {patients.length > 0 && (
                      <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                        {patients.map((p) => (
                          <li key={p.id}>
                            <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setPatient(p); setPatients([]) }}>{p.name}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Field>
              <Field label="Profissional responsável" required={controlled}>
                <FilterSelect className="w-full" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                  <option value="">—</option>
                  {lookups?.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </FilterSelect>
              </Field>
            </div>
          )}

          {operation === 'PERDA' && (
            <Field label="Motivo da perda" required>
              <FilterSelect className="w-full" value={lossReason} onChange={(e) => setLossReason(e.target.value)}>
                {LOSS_REASONS.map((r) => <option key={r} value={r}>{LOSS_REASON_LABELS[r]}</option>)}
              </FilterSelect>
            </Field>
          )}

          <Field
            label={operation === 'AJUSTE' ? 'Motivo do ajuste' : operation === 'CONSUMO' && controlled ? 'Justificativa' : 'Observação'}
            required={operation === 'AJUSTE' || (operation === 'CONSUMO' && controlled)}
          >
            <Textarea className="w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          {operation === 'CONSUMO' && controlled && item.controlledNote && (
            <Check checked={ack} onChange={setAck}>Li a observação do controlado acima.</Check>
          )}
          {needsTempConfirm && (
            <Check checked={confirmTemp} onChange={setConfirmTemp}>Confirmo o armazenamento neste local apesar da temperatura diferente.</Check>
          )}
        </>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="flex gap-2 text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</p>
          {alternatives.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground">Saldo deste item em outros lotes/locais:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {alternatives.map((a, i) => (
                  <li key={i}>
                    {a.locationName} · lote {a.lotNumber}{a.expiresAt ? ` · val. ${fmtDate(a.expiresAt)}` : ''}: <strong>{fmtQty(a.quantity)} {baseUnit}</strong>
                    {isExpired(a.expiresAt) ? ' · vencido' : a.lotStatus && a.lotStatus !== 'LIBERADO' ? ` · ${a.lotStatus.toLowerCase()}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noBalance && <p className="mt-2 text-xs text-muted-foreground">A gestão foi avisada e há uma tarefa aberta para regularizar o saldo.</p>}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-2 border-t border-border bg-card px-5 py-3">
        <Button onClick={submit} disabled={saving || !item}>{saving ? 'Registrando…' : `Registrar ${OPERATION_LABELS[operation].toLowerCase()}`}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
