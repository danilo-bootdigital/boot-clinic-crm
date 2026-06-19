'use client'

import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { FilterSelect } from '@/components/ui/filter-bar'

interface UserRow { id: string; name: string; email: string; role: string }

// Papéis atribuíveis no contexto de clínica (SUPER_ADMIN é nível SaaS — não aparece).
const ROLES = ['OWNER', 'MANAGER', 'DOCTOR', 'RECEPTION', 'FINANCE', 'MARKETING', 'ATTENDANCE'] as const
const LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', OWNER: 'Proprietário', MANAGER: 'Gerente', DOCTOR: 'Médico',
  RECEPTION: 'Recepção', FINANCE: 'Financeiro', MARKETING: 'Marketing', ATTENDANCE: 'Atendimento',
}

// Painel (modal) de SUPORTE SaaS: o SUPER_ADMIN gerencia usuários de QUALQUER clínica
// (reset de senha + edição de nome/e-mail/papel). Página /admin já é guardada por RBAC.
export default function UsersPanel({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; email: string; role: string }>({ name: '', email: '', role: 'RECEPTION' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/companies/${companyId}/users`, { cache: 'no-store' })
    if (!res.ok) { setMsg({ type: 'err', text: 'Falha ao carregar usuários' }); setRows([]); return }
    setRows(await res.json())
  }, [companyId])
  useEffect(() => { load() }, [load])

  function openEdit(u: UserRow) { setEditId(u.id); setForm({ name: u.name, email: u.email, role: u.role }); setMsg(null) }

  async function save(uid: string) {
    setMsg(null)
    const res = await fetch(`/api/admin/companies/${companyId}/users/${uid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (!res.ok) { setMsg({ type: 'err', text: (await res.json().catch(() => ({}))).error || 'Falha ao salvar' }); return }
    setMsg({ type: 'ok', text: 'Usuário atualizado.' }); setEditId(null); load()
  }

  async function resetPassword(u: UserRow) {
    const pwd = window.prompt(`Nova senha provisória para ${u.name} (mín. 6 caracteres):`)
    if (pwd === null) return
    if (pwd.length < 6) { setMsg({ type: 'err', text: 'A senha deve ter ao menos 6 caracteres.' }); return }
    setMsg(null)
    const res = await fetch(`/api/admin/companies/${companyId}/users/${u.id}/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }),
    })
    setMsg(res.ok
      ? { type: 'ok', text: 'Senha redefinida. Informe a nova senha provisória ao usuário.' }
      : { type: 'err', text: (await res.json().catch(() => ({}))).error || 'Falha ao redefinir senha' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Usuários — {companyName}</h3>
            <p className="text-xs text-muted-foreground">Suporte: redefinir senha e editar dados/papel dos usuários desta clínica.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5">
          {msg && <p className={`mb-3 text-sm ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}>{msg.text}</p>}
          {rows === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário nesta clínica.</p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((u) => (
                <div key={u.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email} · {LABELS[u.role] || u.role}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => openEdit(u)} className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted">Editar</button>
                      <button onClick={() => resetPassword(u)} className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted">Redefinir senha</button>
                    </div>
                  </div>
                  {editId === u.id && (
                    <div className="mt-3 rounded-lg border border-border p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                        <div><label className="mb-1 block text-xs font-medium text-muted-foreground">E-mail (login)</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Papel</label>
                          {u.role === 'SUPER_ADMIN' ? (
                            <p className="px-2 py-1.5 text-sm text-muted-foreground">Super Admin (não editável aqui)</p>
                          ) : (
                            <FilterSelect className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                              {ROLES.map((r) => <option key={r} value={r}>{LABELS[r]}</option>)}
                            </FilterSelect>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => save(u.id)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Salvar</button>
                        <button onClick={() => setEditId(null)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
