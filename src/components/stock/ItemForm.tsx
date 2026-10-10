'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'
import { CONTROLLED_LISTS, ITEM_KIND_LABELS, STORAGE_TEMP_LABELS } from '@/lib/stock-caps'
import { Check, ControlledNote, Field, apiSend, type Lookups } from './shared'

type Item = Record<string, any>

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const str = (v: unknown) => (v == null ? '' : String(v))

// Cadastro do item. Controlado: lista da Portaria 344 + observação obrigatória
// de leitura na saída (§5.11). Custo NÃO é editável aqui — só muda pelo razão.
export function ItemForm({ item, lookups, canViewCost, onSaved, onCancel }: {
  item?: Item | null
  lookups: Lookups | null
  canViewCost: boolean
  onSaved: (saved: Item) => void
  onCancel: () => void
}) {
  const [f, setF] = useState(() => ({
    name: str(item?.name),
    categoryId: str(item?.categoryId),
    kind: str(item?.kind) || 'INSUMO',
    sku: str(item?.sku),
    barcode: str(item?.barcode),
    manufacturer: str(item?.manufacturer),
    anvisaRegistration: str(item?.anvisaRegistration),
    baseUnit: str(item?.baseUnit) || 'un',
    purchaseUnit: str(item?.purchaseUnit),
    conversionFactor: str(item?.conversionFactor ?? 1),
    tracksLot: item?.tracksLot ?? true,
    tracksExpiry: item?.tracksExpiry ?? true,
    tracksPatient: item?.tracksPatient ?? false,
    isControlled: item?.isControlled ?? false,
    controlledList: str(item?.controlledList),
    controlledNote: str(item?.controlledNote),
    storageTemp: str(item?.storageTemp) || 'AMBIENTE',
    multiDose: item?.multiDose ?? false,
    openedShelfLifeHours: str(item?.openedShelfLifeHours),
    minQty: str(item?.minQty),
    reorderPoint: str(item?.reorderPoint),
    maxQty: str(item?.maxQty),
    leadTimeDays: str(item?.leadTimeDays),
    preferredSupplierId: str(item?.preferredSupplierId),
    salePrice: str(item?.salePrice),
    notes: str(item?.notes),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))

  async function save() {
    setError(null)
    if (!f.name.trim()) return setError('Informe o nome do item')
    if (f.isControlled && !f.controlledList) return setError('Item controlado exige a lista da Portaria 344/98')
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      categoryId: f.categoryId || null,
      kind: f.kind,
      sku: f.sku || null,
      barcode: f.barcode || null,
      manufacturer: f.manufacturer || null,
      anvisaRegistration: f.anvisaRegistration || null,
      baseUnit: f.baseUnit.trim(),
      purchaseUnit: f.purchaseUnit || null,
      conversionFactor: numOrNull(f.conversionFactor) ?? 1,
      tracksLot: f.isControlled ? true : f.tracksLot,
      tracksExpiry: f.tracksLot || f.isControlled ? f.tracksExpiry : false,
      tracksPatient: f.isControlled ? true : f.tracksPatient,
      isControlled: f.isControlled,
      controlledList: f.isControlled ? f.controlledList : null,
      controlledNote: f.isControlled ? f.controlledNote || null : null,
      storageTemp: f.storageTemp,
      multiDose: f.multiDose,
      openedShelfLifeHours: f.multiDose ? numOrNull(f.openedShelfLifeHours) : null,
      minQty: numOrNull(f.minQty),
      reorderPoint: numOrNull(f.reorderPoint),
      maxQty: numOrNull(f.maxQty),
      leadTimeDays: numOrNull(f.leadTimeDays),
      preferredSupplierId: f.preferredSupplierId || null,
      notes: f.notes || null,
    }
    if (canViewCost) body.salePrice = f.kind === 'REVENDA' ? numOrNull(f.salePrice) : null
    setSaving(true)
    const res = await apiSend(item ? `/api/estoque/items/${item.id}` : '/api/estoque/items', item ? 'PATCH' : 'POST', body)
    setSaving(false)
    if (!res.ok) return setError(res.data?.error || 'Erro ao salvar')
    onSaved(res.data)
  }

  const unit = f.baseUnit || 'un'

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <Field label="Nome" required>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Toxina botulínica 100U" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <FilterSelect className="w-full" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
              {Object.entries(ITEM_KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </FilterSelect>
          </Field>
          <Field label="Categoria">
            <FilterSelect className="w-full" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">Sem categoria</option>
              {lookups?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          </Field>
          <Field label="Fabricante">
            <Input value={f.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} />
          </Field>
          <Field label="Registro ANVISA">
            <Input value={f.anvisaRegistration} onChange={(e) => set({ anvisaRegistration: e.target.value })} />
          </Field>
          <Field label="Código interno (SKU)">
            <Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} />
          </Field>
          <Field label="Código de barras (EAN)">
            <Input inputMode="numeric" value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-5">
        <h4 className="text-sm font-semibold">Unidades</h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Unidade base" required hint="Em que se consome e conta (U, ml, un, g).">
            <Input value={f.baseUnit} onChange={(e) => set({ baseUnit: e.target.value })} disabled={!!item} />
          </Field>
          <Field label="Unidade de compra" hint="Ex.: frasco, caixa.">
            <Input value={f.purchaseUnit} onChange={(e) => set({ purchaseUnit: e.target.value })} />
          </Field>
          <Field label={`${unit} por ${f.purchaseUnit || 'unid. de compra'}`} hint="Frasco de 100U → 100.">
            <Input inputMode="decimal" value={f.conversionFactor} onChange={(e) => set({ conversionFactor: e.target.value })} />
          </Field>
        </div>
        {item && <p className="text-xs text-muted-foreground">A unidade base não muda depois que o item é cadastrado.</p>}
      </section>

      <section className="space-y-2 border-t border-border pt-5">
        <h4 className="text-sm font-semibold">Controles</h4>
        <Check checked={f.tracksLot || f.isControlled} onChange={(v) => set({ tracksLot: v, tracksExpiry: v ? f.tracksExpiry : false })}>
          Controla lote
        </Check>
        <Check checked={(f.tracksLot || f.isControlled) && f.tracksExpiry} onChange={(v) => set({ tracksExpiry: v })}>
          Controla validade
        </Check>
        <Check checked={f.tracksPatient || f.isControlled} onChange={(v) => set({ tracksPatient: v })}>
          Exige paciente na saída (injetáveis, implantáveis)
        </Check>
        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          <Field label="Armazenamento">
            <FilterSelect className="w-full" value={f.storageTemp} onChange={(e) => set({ storageTemp: e.target.value })}>
              {Object.entries(STORAGE_TEMP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </FilterSelect>
          </Field>
        </div>
        <Check checked={f.multiDose} onChange={(v) => set({ multiDose: v })}>Multidose (frasco usado em mais de um paciente)</Check>
        {f.multiDose && (
          <Field label="Validade depois de aberto (horas)" className="sm:max-w-xs">
            <Input inputMode="numeric" value={f.openedShelfLifeHours} onChange={(e) => set({ openedShelfLifeHours: e.target.value })} />
          </Field>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <Check checked={f.isControlled} onChange={(v) => set({ isControlled: v })}>
          <span className="font-medium">Medicamento controlado (Portaria SVS/MS 344/98)</span>
        </Check>
        {f.isControlled && (
          <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <Field label="Lista da portaria" required className="sm:max-w-xs">
              <FilterSelect className="w-full" value={f.controlledList} onChange={(e) => set({ controlledList: e.target.value })}>
                <option value="">Selecione</option>
                {CONTROLLED_LISTS.map((l) => <option key={l} value={l}>Lista {l}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Observação" hint="Aparece em destaque onde o item aparecer. Na saída, quem baixa confirma que leu.">
              <Textarea className="w-full" rows={2} value={f.controlledNote} onChange={(e) => set({ controlledNote: e.target.value })}
                placeholder="Ex.: Guardar no armário trancado. Conferir a receita retida antes de aplicar." />
            </Field>
            <p className="text-xs text-muted-foreground">Controlado é sempre rastreado por lote e por paciente, e só fica em local de guarda de controlados.</p>
            {(f.controlledList || f.controlledNote) && <ControlledNote list={f.controlledList} note={f.controlledNote} />}
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-5">
        <h4 className="text-sm font-semibold">Reposição <span className="font-normal text-muted-foreground">(em {unit})</span></h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estoque mínimo" hint="Abaixo disso: crítico.">
            <Input inputMode="decimal" value={f.minQty} onChange={(e) => set({ minQty: e.target.value })} />
          </Field>
          <Field label="Ponto de pedido" hint="Abaixo disso: repor.">
            <Input inputMode="decimal" value={f.reorderPoint} onChange={(e) => set({ reorderPoint: e.target.value })} />
          </Field>
          <Field label="Estoque máximo">
            <Input inputMode="decimal" value={f.maxQty} onChange={(e) => set({ maxQty: e.target.value })} />
          </Field>
          <Field label="Prazo do fornecedor (dias)">
            <Input inputMode="numeric" value={f.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} />
          </Field>
          <Field label="Fornecedor preferencial" className="sm:col-span-2">
            <FilterSelect className="w-full" value={f.preferredSupplierId} onChange={(e) => set({ preferredSupplierId: e.target.value })}>
              <option value="">Nenhum</option>
              {lookups?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
          </Field>
          {canViewCost && f.kind === 'REVENDA' && (
            <Field label="Preço de venda (R$)" hint="A venda ao paciente entra na Fase 8.">
              <Input inputMode="decimal" value={f.salePrice} onChange={(e) => set({ salePrice: e.target.value })} />
            </Field>
          )}
        </div>
        <Field label="Observações internas">
          <Textarea className="w-full" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </section>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="sticky bottom-0 -mx-5 -mb-4 flex gap-2 border-t border-border bg-card px-5 py-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : item ? 'Salvar alterações' : 'Cadastrar item'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
