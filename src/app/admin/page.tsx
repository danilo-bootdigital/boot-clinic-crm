'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Users, Activity } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'

type Company = {
  id: string
  name: string
  cnpj: string | null
  phone: string | null
  email: string | null
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELED'
  plan: string | null
  createdAt: string
  usersCount: number
  patientsCount: number
}
type Summary = { total: number; active: number; trial: number; suspended: number }

const STATUS_LABELS: Record<Company['status'], string> = {
  ACTIVE: 'Ativa', TRIAL: 'Teste', SUSPENDED: 'Suspensa', CANCELED: 'Cancelada',
}
const STATUS_STYLES: Record<Company['status'], string> = {
  ACTIVE: 'bg-success/10 text-success',
  TRIAL: 'bg-warning/10 text-warning',
  SUSPENDED: 'bg-destructive/10 text-destructive',
  CANCELED: 'bg-muted text-muted-foreground',
}

const field = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const label = 'block text-sm font-medium text-gray-700 mb-1'

const emptyForm = {
  name: '', cnpj: '', phone: '', email: '', plan: 'trial', status: 'ACTIVE',
  ownerName: '', ownerEmail: '', ownerPassword: '',
}

export default function AdminPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [denied, setDenied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/companies', { cache: 'no-store' })
    if (res.status === 401) { router.push('/login?redirect=/admin'); return }
    if (res.status === 403) { setDenied(true); setCompanies([]); return }
    if (res.ok) {
      const data = await res.json()
      setCompanies(data.companies)
      setSummary(data.summary)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  async function createCompany(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/admin/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      setMsg({ type: 'ok', text: 'Clínica criada com sucesso.' })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } else {
      const e = await res.json().catch(() => ({}))
      setMsg({ type: 'err', text: e.error || 'Falha ao criar a clínica.' })
    }
  }

  async function setStatus(c: Company, status: Company['status']) {
    const res = await fetch(`/api/admin/companies/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) load()
    else setMsg({ type: 'err', text: 'Falha ao atualizar status.' })
  }

  async function removeCompany(c: Company) {
    if (!confirm(`Encerrar a clínica "${c.name}"? Isso remove o acesso de todos os usuários dela. Esta ação é irreversível.`)) return
    const res = await fetch(`/api/admin/companies/${c.id}`, { method: 'DELETE' })
    if (res.ok) { setMsg({ type: 'ok', text: 'Clínica encerrada.' }); load() }
    else {
      const e = await res.json().catch(() => ({}))
      setMsg({ type: 'err', text: e.error || 'Falha ao encerrar a clínica.' })
    }
  }

  if (denied) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clínicas" description="Painel do administrador do SaaS" icon={<Building2 className="h-5 w-5" />} />
        <SectionCard title="Acesso restrito">
          <p className="text-sm text-muted-foreground">Este painel é exclusivo do administrador do sistema (SUPER_ADMIN).</p>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clínicas"
        description="Gerencie as clínicas assinantes do SaaS"
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <button
            onClick={() => { setShowForm((v) => !v); setMsg(null) }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova Clínica
          </button>
        }
      />

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {msg.text}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total de clínicas" value={summary.total} icon={<Building2 className="h-5 w-5" />} tone="primary" />
          <StatCard label="Ativas" value={summary.active} icon={<Activity className="h-5 w-5" />} tone="success" />
          <StatCard label="Em teste" value={summary.trial} tone="warning" />
          <StatCard label="Suspensas/Canceladas" value={summary.suspended} tone="destructive" />
        </div>
      )}

      {showForm && (
        <SectionCard title="Nova clínica" description="Cadastra a clínica e o usuário responsável (OWNER) que fará o primeiro acesso.">
          <form onSubmit={createCompany} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Nome da clínica *</label>
                <input className={field} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className={label}>CNPJ</label>
                <input className={field} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
              </div>
              <div>
                <label className={label}>Telefone</label>
                <input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className={label}>E-mail da clínica</label>
                <input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className={label}>Plano</label>
                <select className={field} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  <option value="trial">Trial</option>
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              <div>
                <label className={label}>Status inicial</label>
                <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">Ativa</option>
                  <option value="TRIAL">Teste</option>
                  <option value="SUSPENDED">Suspensa</option>
                </select>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">Responsável (acesso OWNER)</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={label}>Nome *</label>
                  <input className={field} required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>E-mail *</label>
                  <input type="email" className={field} required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Senha provisória *</label>
                  <input type="text" className={field} required minLength={6} value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {saving ? 'Criando...' : 'Criar clínica'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setForm(emptyForm) }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Cancelar
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard title="Clínicas cadastradas">
        {companies === null ? (
          <LoadingState rows={5} />
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma clínica cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Clínica</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Plano</th>
                  <th className="px-3 py-2">Usuários</th>
                  <th className="px-3 py-2">Pacientes</th>
                  <th className="px-3 py-2">Criada em</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 capitalize">{c.plan || '—'}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />{c.usersCount}</span>
                    </td>
                    <td className="px-3 py-3">{c.patientsCount}</td>
                    <td className="px-3 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {c.status === 'SUSPENDED' || c.status === 'CANCELED' ? (
                          <button onClick={() => setStatus(c, 'ACTIVE')} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-success hover:bg-success/10">
                            Reativar
                          </button>
                        ) : (
                          <button onClick={() => setStatus(c, 'SUSPENDED')} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10">
                            Suspender
                          </button>
                        )}
                        <button onClick={() => removeCompany(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                          Encerrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
