'use client'

import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'

interface ModuleRow {
  key: string
  label: string
  isCore: boolean
  available: boolean
  enabled: boolean
  override: boolean | null
}

// Painel (modal) para ligar/desligar módulos de uma clínica — nível Clínica do
// controle SaaS modular. Só SUPER_ADMIN chega aqui (página /admin já é guardada).
export default function ModulesPanel({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const [rows, setRows] = useState<ModuleRow[] | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/companies/${companyId}/modules`, { cache: 'no-store' })
    if (!res.ok) { setErr('Falha ao carregar módulos'); setRows([]); return }
    const data = await res.json()
    setPlan(data.plan); setRows(data.modules)
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function toggle(m: ModuleRow, enabled: boolean) {
    setBusy(m.key); setErr(null)
    const res = await fetch(`/api/admin/companies/${companyId}/modules`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleKey: m.key, enabled }),
    })
    setBusy(null)
    if (!res.ok) { const e = await res.json().catch(() => ({})); setErr(e.error || 'Falha ao salvar'); return }
    load()
  }

  const built = rows?.filter((r) => r.available) ?? []
  const future = rows?.filter((r) => !r.available) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Módulos — {companyName}</h3>
            <p className="text-xs text-muted-foreground">Plano: {plan || '—'} · ligue/desligue módulos para esta clínica</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
          {rows === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div className="space-y-1">
                {built.map((m) => (
                  <Row key={m.key} m={m} busy={busy === m.key} onToggle={(v) => toggle(m, v)} />
                ))}
              </div>
              {future.length > 0 && (
                <>
                  <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Futuros (preparados)</p>
                  <div className="space-y-1 opacity-70">
                    {future.map((m) => (
                      <div key={m.key} className="flex items-center justify-between rounded-lg px-3 py-2">
                        <span className="text-sm text-foreground">{m.label}</span>
                        <span className="text-xs text-muted-foreground">em breve</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ m, busy, onToggle }: { m: ModuleRow; busy: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/40">
      <div>
        <span className="text-sm font-medium text-foreground">{m.label}</span>
        {m.isCore && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">essencial</span>}
        {m.override === false && <span className="ml-2 text-[10px] text-destructive">desativado pela clínica</span>}
      </div>
      <button
        disabled={m.isCore || busy}
        onClick={() => onToggle(!m.enabled)}
        title={m.isCore ? 'Módulo essencial — sempre ativo' : undefined}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${m.enabled ? 'bg-primary' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${m.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
