'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'

type Tab = 'clinica' | 'usuarios' | 'notificacoes'
const TABS: { key: Tab; label: string }[] = [
  { key: 'clinica', label: 'Clínica' },
  { key: 'usuarios', label: 'Usuários e Permissões' },
  { key: 'notificacoes', label: 'Notificações' },
]

const ROLES = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE']
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', OWNER: 'Proprietário', MANAGER: 'Gerente', DOCTOR: 'Médico',
  RECEPTION: 'Recepção', FINANCE: 'Financeiro', MARKETING: 'Marketing', ATTENDANCE: 'Atendimento',
}

const field = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('clinica')

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Preferências gerais do sistema e da clínica" icon={<Settings className="h-5 w-5" />} />
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'clinica' && <ClinicaTab router={router} />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'notificacoes' && <NotificacoesTab />}
    </div>
  )
}

function ClinicaTab({ router }: { router: any }) {
  const [form, setForm] = useState<any | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/company', { cache: 'no-store' })
      if (res.status === 401) { router.push('/login?redirect=/configuracoes'); return }
      if (res.ok) setForm(await res.json())
    })()
  }, [router])

  if (!form) return <LoadingState rows={3} />

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)
    const res = await fetch('/api/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setMsg(res.ok ? 'Dados salvos.' : (await res.json().catch(() => ({}))).error || 'Falha ao salvar')
  }
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <SectionCard title="Dados da Clínica">
      <form onSubmit={save} className="space-y-4 max-w-2xl">
        <div><label className={label}>Nome *</label><input className={field} value={form.name || ''} onChange={(e) => set('name', e.target.value)} required /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className={label}>CNPJ</label><input className={field} value={form.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} /></div>
          <div><label className={label}>Telefone</label><input className={field} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>
        <div><label className={label}>E-mail</label><input type="email" className={field} value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className={label}>Endereço</label><input className={field} value={form.address || ''} onChange={(e) => set('address', e.target.value)} /></div>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
        <div className="pt-2 border-t"><button type="submit" disabled={saving} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
    </SectionCard>
  )
}

const MODULES: [string, string][] = [
  ['patients', 'Pacientes'], ['crm', 'CRM'], ['agenda', 'Agenda'],
  ['followup', 'Follow-up'], ['dashboard', 'Dashboard'], ['configuracoes', 'Configurações'],
]
const LEVELS: [string, string][] = [['none', 'Sem acesso'], ['view', 'Visualizar'], ['edit', 'Editar']]
const ADMIN_ROLE = (r: string) => r === 'OWNER' || r === 'SUPER_ADMIN'
const emptyPerms = () => Object.fromEntries(MODULES.map(([m]) => [m, 'none'])) as Record<string, string>

function PermissionMatrix({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MODULES.map(([m, lbl]) => (
        <div key={m} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm text-foreground">{lbl}</span>
          <select className="px-2 py-1 border border-gray-300 rounded text-sm" value={value[m] || 'none'} onChange={(e) => onChange({ ...value, [m]: e.target.value })}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
    </div>
  )
}

function UsuariosTab() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [perms, setPerms] = useState<Record<string, string>>(emptyPerms())
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<any>({ name: '', email: '', password: '', role: 'RECEPTION', permissions: emptyPerms() })

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/users', { cache: 'no-store' })
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function changeRole(id: string, role: string) {
    setMsg(null)
    const res = await fetch(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || 'Falha ao alterar papel')
    load()
  }
  async function savePerms(id: string) {
    setMsg(null)
    const res = await fetch(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permissions: perms }) })
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || 'Falha ao salvar permissões')
    else { setMsg('Permissões salvas.'); setEditing(null) }
    load()
  }
  async function removeUser(id: string, name: string) {
    if (!confirm(`Remover o usuário ${name}? A conta de acesso será excluída.`)) return
    setMsg(null)
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || 'Falha ao remover usuário')
    else setMsg('Usuário removido.')
    load()
  }
  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { setMsg((await res.json().catch(() => ({}))).error || 'Falha ao criar usuário'); return }
    setAdding(false); setForm({ name: '', email: '', password: '', role: 'RECEPTION', permissions: emptyPerms() })
    setMsg('Usuário criado.'); load()
  }

  if (loading) return <LoadingState rows={3} />

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-lg border border-border bg-accent/40 px-4 py-2 text-sm">{msg}</div>}

      <SectionCard title="Equipe e Permissões">
        <div className="mb-4">
          {!adding ? (
            <button onClick={() => setAdding(true)} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">+ Adicionar usuário</button>
          ) : (
            <form onSubmit={createUser} className="space-y-4 rounded-lg border border-border p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={label}>Nome *</label><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div><label className={label}>E-mail *</label><input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div><label className={label}>Senha inicial *</label><input type="text" className={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required /></div>
                <div><label className={label}>Papel</label><select className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
              </div>
              <div>
                <label className={label}>Permissões por módulo</label>
                {ADMIN_ROLE(form.role)
                  ? <p className="text-sm text-muted-foreground">Proprietário/Super Admin têm acesso total a tudo.</p>
                  : <PermissionMatrix value={form.permissions} onChange={(v) => setForm({ ...form, permissions: v })} />}
              </div>
              <div className="flex gap-3 pt-2 border-t">
                <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">Criar usuário</button>
                <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancelar</button>
              </div>
            </form>
          )}
        </div>

        <div className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  {!ADMIN_ROLE(u.role) && (
                    <button
                      onClick={() => { setEditing(editing === u.id ? null : u.id); setPerms({ ...emptyPerms(), ...(u.permissions || {}) }) }}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
                      Permissões
                    </button>
                  )}
                  <button
                    onClick={() => removeUser(u.id, u.name)}
                    className="px-3 py-1.5 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10">
                    Remover
                  </button>
                </div>
              </div>
              {editing === u.id && (
                <div className="mt-3 rounded-lg border border-border p-3">
                  <PermissionMatrix value={perms} onChange={setPerms} />
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => savePerms(u.id)} className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">Salvar permissões</button>
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Fechar</button>
                  </div>
                </div>
              )}
              {ADMIN_ROLE(u.role) && <p className="mt-1 text-xs text-muted-foreground">Acesso total (papel administrativo).</p>}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function NotificacoesTab() {
  const [s, setS] = useState<any | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => { const res = await fetch('/api/notifications/settings', { cache: 'no-store' }); if (res.ok) setS(await res.json()) })()
  }, [])

  if (!s) return <LoadingState rows={3} />

  async function toggle(key: string) {
    const next = { ...s, [key]: !s[key] }
    setS(next); setMsg(null)
    const res = await fetch('/api/notifications/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: next[key] }) })
    setMsg(res.ok ? 'Preferências salvas.' : 'Falha ao salvar')
  }

  const OPTIONS: [string, string, string][] = [
    ['appointmentReminders', 'Lembretes de consulta', 'Avisar pacientes sobre consultas agendadas'],
    ['followUpReminders', 'Lembretes de follow-up', 'Notificar tarefas de acompanhamento'],
    ['emailEnabled', 'Canal: E-mail', 'Enviar notificações por e-mail'],
    ['smsEnabled', 'Canal: SMS', 'Enviar notificações por SMS'],
    ['whatsappEnabled', 'Canal: WhatsApp', 'Enviar notificações por WhatsApp'],
  ]

  return (
    <SectionCard title="Preferências de Notificação">
      {msg && <p className="mb-3 text-sm text-muted-foreground">{msg}</p>}
      <div className="divide-y divide-border">
        {OPTIONS.map(([key, title, desc]) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div><p className="text-sm font-medium text-foreground">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
            <button onClick={() => toggle(key)} role="switch" aria-checked={!!s[key]}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${s[key] ? 'bg-primary' : 'bg-muted'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s[key] ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">As preferências são salvas; o envio efetivo depende dos módulos de mensageria (em construção).</p>
    </SectionCard>
  )
}
