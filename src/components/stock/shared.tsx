'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { TabsNav } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { stockCan, type StockStatus } from '@/lib/stock-caps'

export type Lookups = {
  categories: { id: string; name: string }[]
  locations: { id: string; name: string; type: string; storageTemp: string; isDefault: boolean; controlledStorage: boolean }[]
  rooms: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  professionals: { id: string; name: string }[]
}

// Papel do usuário logado (RBAC client-side só p/ esconder botões — o servidor revalida).
export function useRole() {
  const [role, setRole] = useState('')
  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((m) => setRole(m?.role || '')).catch(() => {})
  }, [])
  return role
}

export function useLookups() {
  const [data, setData] = useState<Lookups | null>(null)
  const reload = useCallback(() => {
    fetch('/api/estoque/lookups').then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {})
  }, [])
  useEffect(() => { reload() }, [reload])
  return { lookups: data, reloadLookups: reload }
}

export function StockTabs({ role }: { role: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/estoque', label: 'Itens', show: true },
    { href: '/estoque/movimentacoes', label: 'Movimentações', show: true },
    { href: '/estoque/configuracoes', label: 'Configurações', show: stockCan(role, 'manage') },
  ].filter((t) => t.show)
  const items = tabs.map((t) => ({
    href: t.href,
    label: t.label,
    active: t.href === '/estoque' ? pathname === '/estoque' || pathname.startsWith('/estoque/itens') : pathname.startsWith(t.href),
  }))
  return <TabsNav items={items} scrollable className="mb-6" />
}

export const fmtQty = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

const STATUS_META: Record<StockStatus, { label: string; tone: 'success' | 'warning' | 'destructive' | 'neutral' }> = {
  ok: { label: 'OK', tone: 'success' },
  repor: { label: 'Repor', tone: 'warning' },
  critico: { label: 'Crítico', tone: 'destructive' },
  zerado: { label: 'Zerado', tone: 'neutral' },
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.ok
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
}

// Selo CONTROLADO · lista X — aparece onde o item controlado aparecer (§5.11).
export function ControlledBadge({ list }: { list?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive ring-1 ring-inset ring-destructive/20">
      <ShieldAlert className="h-3 w-3" aria-hidden />
      Controlado{list ? ` · lista ${list}` : ''}
    </span>
  )
}

// Observação do controlado em destaque (não colapsa, não some no mobile).
export function ControlledNote({ note, list, className }: { note?: string | null; list?: string | null; className?: string }) {
  return (
    <div role="note" className={cn('flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm', className)}>
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold text-destructive">Controlado (Portaria 344/98){list ? ` · lista ${list}` : ''}</p>
        {note && <p className="mt-0.5 text-foreground">{note}</p>}
      </div>
    </div>
  )
}

export function Field({ label, hint, required, className, children }: {
  label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

export async function apiSend(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}
