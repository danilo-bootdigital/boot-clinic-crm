'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Users, Activity } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import ModulesPanel from '@/components/admin/ModulesPanel'
import UsersPanel from '@/components/admin/UsersPanel'
import { Input } from '@/components/ui/input'
import { FilterSelect } from '@/components/ui/filter-bar'

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

type EditForm = {
  id: string
  name: string
  cnpj: string
  phone: string
  email: string
  address: string
  plan: string
  status: Company['status']
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

const label = 'block text-sm font-medium text-foreground mb-1'

const emptyForm = {
  name: '', cnpj: '', phone: '', email: '', plan: 'trial',
  ownerName: '', ownerEmail: '', ownerPassword: '',
}

const PLAN_LABELS: Record<string, string> = { trial: 'Trial (grátis)', basic: 'Basic — R$197/mês', pro: 'Pro — R$397/mês' }

export default function AdminPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [denied, setDenied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)
  const [modulesFor, setModulesFor] = useState<Company | null>(null)
  const [usersFor, setUsersFor] = useState<Company | null>(null)
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
    setInvoiceUrl(null)
    const res = await fetch('/api/admin/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setInvoiceUrl(data.invoiceUrl || null)
      setMsg({
        type: 'ok',
        text: data.warning
          ? `Clínica criada, mas a cobrança ficou pendente: ${data.warning}`
          : data.invoiceUrl
            ? 'Clínica criada. Envie o link da fatura abaixo ao cliente para cadastrar o cartão.'
            : 'Clínica criada com sucesso.',
      })
      setForm(emptyForm)
      setShowForm(false)
      load()
    } else {
      setMsg({ type: 'err', text: data.error || 'Falha ao criar a clínica.' })
    }
  }

  // Consulta/gera a cobrança de uma clínica e mostra o link da fatura.
  async function openBilling(c: Company) {
    setMsg(null); setInvoiceUrl(null)
    const res = await fetch(`/api/admin/companies/${c.id}/billing`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ type: 'err', text: data.error || 'Falha ao consultar cobrança.' }); return }
    if (data.invoiceUrl) {
      setInvoiceUrl(data.invoiceUrl)
      setMsg({ type: 'ok', text: `Cobrança de "${c.name}" (${PLAN_LABELS[c.plan || 'trial'] || c.plan}) — status da fatura: ${data.lastPaymentStatus || '—'}.` })
    } else if (!data.asaasConfigured) {
      setMsg({ type: 'err', text: 'Asaas não configurado no servidor (defina ASAAS_API_KEY).' })
    } else if ((c.plan === 'basic' || c.plan === 'pro') && !data.asaasSubscriptionId) {
      // plano pago sem assinatura → tenta gerar
      const gen = await fetch(`/api/admin/companies/${c.id}/billing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: c.plan }),
      })
      const g = await gen.json().catch(() => ({}))
      if (gen.ok && g.invoiceUrl) { setInvoiceUrl(g.invoiceUrl); setMsg({ type: 'ok', text: 'Assinatura gerada. Envie o link da fatura ao cliente.' }) }
      else setMsg({ type: 'err', text: g.warning || g.error || 'Não foi possível gerar a assinatura.' })
    } else {
      setMsg({ type: 'ok', text: `"${c.name}" está no plano ${PLAN_LABELS[c.plan || 'trial'] || c.plan} (sem fatura pendente).` })
    }
  }

  // Abre o formulário de edição: busca o detalhe (inclui endereço, não vem na lista).
  async function openEdit(c: Company) {
    setMsg(null); setInvoiceUrl(null)
    const res = await fetch(`/api/admin/companies/${c.id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ type: 'err', text: data.error || 'Falha ao carregar a clínica.' }); return }
    setEditForm({
      id: c.id,
      name: data.name || '',
      cnpj: data.cnpj || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      plan: data.plan || 'trial',
      status: data.status,
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm) return
    setSavingEdit(true); setMsg(null)
    const { id, ...payload } = editForm
    const res = await fetch(`/api/admin/companies/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSavingEdit(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setMsg({ type: 'ok', text: 'Clínica atualizada.' }); setEditForm(null); load() }
    else setMsg({ type: 'err', text: data.error || 'Falha ao atualizar a clínica.' })
  }

  // Gera/rotaciona o token do webhook WhatsApp da clínica e mostra a URL pronta.
  async function genWhatsappToken(c: Company) {
    setMsg(null); setInvoiceUrl(null); setWhatsappUrl(null)
    const res = await fetch(`/api/admin/companies/${c.id}/whatsapp-token`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ type: 'err', text: data.error || 'Falha ao gerar token do webhook.' }); return }
    setWhatsappUrl(data.url)
    setMsg({ type: 'ok', text: `Webhook WhatsApp de "${c.name}" gerado. Configure esta URL na instância da Evolution desta clínica:` })
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
          <p>{msg.text}</p>
          {invoiceUrl && (
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-medium underline break-all">
              Abrir/Copiar link da fatura → {invoiceUrl}
            </a>
          )}
          {whatsappUrl && (
            <code className="mt-2 block break-all rounded bg-background/60 px-2 py-1 font-mono text-xs">{whatsappUrl}</code>
          )}
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
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className={label}>CNPJ {form.plan !== 'trial' && '*'}</label>
                <Input required={form.plan !== 'trial'} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
              </div>
              <div>
                <label className={label}>Telefone</label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className={label}>E-mail da clínica</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className={label}>Plano</label>
                <FilterSelect className="w-full" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  <option value="trial">Trial (grátis)</option>
                  <option value="basic">Basic — R$197/mês</option>
                  <option value="pro">Pro — R$397/mês</option>
                </FilterSelect>
                {(form.plan === 'basic' || form.plan === 'pro') && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Plano pago: o CNPJ é obrigatório. Geramos a assinatura no cartão (recorrente) e um link de fatura para o cliente cadastrar o cartão. A clínica fica em <strong>Teste</strong> até o 1º pagamento.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">Responsável (acesso OWNER)</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={label}>Nome *</label>
                  <Input required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>E-mail *</label>
                  <Input type="email" required value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
                </div>
                <div>
                  <label className={label}>Senha provisória *</label>
                  <Input type="text" required minLength={6} value={form.ownerPassword} onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })} />
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

      {editForm && (
        <SectionCard title={`Editar clínica — ${editForm.name || ''}`} description="Dados cadastrais, plano e status. Encerrar/suspender continuam como ações separadas.">
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Nome da clínica *</label>
                <Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className={label}>CNPJ</label>
                <Input value={editForm.cnpj} onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })} />
              </div>
              <div>
                <label className={label}>Telefone</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div>
                <label className={label}>E-mail principal</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Endereço</label>
                <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div>
                <label className={label}>Plano</label>
                <FilterSelect className="w-full" value={editForm.plan} onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}>
                  <option value="trial">Trial (grátis)</option>
                  <option value="basic">Basic — R$197/mês</option>
                  <option value="pro">Pro — R$397/mês</option>
                </FilterSelect>
              </div>
              <div>
                <label className={label}>Status</label>
                <FilterSelect className="w-full" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Company['status'] })}>
                  <option value="ACTIVE">Ativa</option>
                  <option value="TRIAL">Teste</option>
                  <option value="SUSPENDED">Suspensa</option>
                  <option value="CANCELED">Cancelada</option>
                </FilterSelect>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Para gerenciar os módulos habilitados, use o botão “Módulos”. Toda alteração aqui é registrada em auditoria.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={savingEdit} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
              <button type="button" onClick={() => setEditForm(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
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
                        <button onClick={() => openEdit(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
                          Editar
                        </button>
                        <button onClick={() => openBilling(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                          Cobrança
                        </button>
                        <button onClick={() => setModulesFor(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
                          Módulos
                        </button>
                        <button onClick={() => setUsersFor(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
                          Usuários
                        </button>
                        <button onClick={() => genWhatsappToken(c)} className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted">
                          Webhook WA
                        </button>
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

      {modulesFor && (
        <ModulesPanel companyId={modulesFor.id} companyName={modulesFor.name} onClose={() => setModulesFor(null)} />
      )}

      {usersFor && (
        <UsersPanel companyId={usersFor.id} companyName={usersFor.name} onClose={() => setUsersFor(null)} />
      )}
    </div>
  )
}
