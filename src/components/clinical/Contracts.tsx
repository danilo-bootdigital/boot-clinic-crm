'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Plus, ArrowLeft, Send, XCircle, PenLine, Download, Copy, Check } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { ActionButton } from '@/components/ui/action-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-bar'
import { CONTRACT_STATUS_LABELS, renderContractContent } from '@/lib/validations/clinical'
import { unresolvedVariables } from '@/lib/contracts/variables'

const STATUS_TONE: Record<string, any> = { DRAFT: 'warning', SENT: 'info', SIGNED: 'success', CANCELED: 'destructive' }

// Rótulo legível das variáveis do cadastro, para o aviso de "falta no cadastro".
const FIELD_LABEL: Record<string, string> = {
  cpf: 'CPF', data_nascimento: 'data de nascimento', idade: 'idade', sexo: 'sexo', telefone: 'telefone',
  whatsapp: 'WhatsApp', email: 'e-mail', endereco: 'endereço', cidade: 'cidade', estado: 'estado', cep: 'CEP',
  endereco_completo: 'endereço', convenio: 'convênio', numero_convenio: 'nº do convênio',
  cnpj_clinica: 'CNPJ da clínica', endereco_clinica: 'endereço da clínica', telefone_clinica: 'telefone da clínica',
  email_clinica: 'e-mail da clínica', procedimento: 'procedimento', valor: 'valor', profissional: 'profissional',
}

type Filtro = 'todos' | 'pendentes' | 'assinados'
type LinkInfo = { link: string; sent: boolean; sentTo: string | null; error: string | null }

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Contracts({ patient, canEdit = true }: { patient: any; canEdit?: boolean }) {
  const patientId = patient.id
  const [rows, setRows] = useState<any[] | null>(null)
  const [templates, setTemplates] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', templateId: '', content: '', value: '', procedure: '', professional: '' })
  const [vars, setVars] = useState<Record<string, string> | null>(null)
  const [edited, setEdited] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, LinkInfo>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/patients/${patientId}/contracts`, { cache: 'no-store' })
    setRows(res.ok ? await res.json() : [])
  }, [patientId])

  useEffect(() => {
    load()
    fetch('/api/clinico/contract-templates').then((r) => r.ok ? r.json() : []).then((t) => setTemplates(t.filter((x: any) => x.isActive !== false))).catch(() => {})
  }, [load])

  const template = templates.find((t) => t.id === form.templateId)

  // Dados do cadastro vêm do servidor (completos e atuais). Recalcula quando
  // procedimento/valor/profissional mudam — com pausa curta para não disparar
  // uma requisição por tecla.
  useEffect(() => {
    if (!creating || !form.templateId) return
    const t = setTimeout(async () => {
      const q = new URLSearchParams()
      if (form.procedure) q.set('procedure', form.procedure)
      if (form.value) q.set('value', form.value)
      if (form.professional) q.set('professional', form.professional)
      const res = await fetch(`/api/patients/${patientId}/contracts/context?${q}`, { cache: 'no-store' })
      if (res.ok) setVars((await res.json()).variables)
    }, 350)
    return () => clearTimeout(t)
  }, [creating, form.templateId, form.procedure, form.value, form.professional, patientId])

  // Enquanto a atendente não mexer no texto, ele acompanha o modelo + dados.
  useEffect(() => {
    if (!template || !vars || edited) return
    setForm((f) => ({ ...f, content: renderContractContent(template.content, vars) }))
  }, [template, vars, edited])

  const faltando = useMemo(() => {
    if (!template || !vars) return []
    const usados = unresolvedVariables(template.content)
    return Array.from(new Set(usados.filter((k) => vars[k] === '').map((k) => FIELD_LABEL[k] ?? k)))
  }, [template, vars])

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    setEdited(false)
    setVars(null)
    setForm((f) => ({ ...f, templateId: id, title: tpl?.name || f.title, content: tpl ? f.content : '' }))
  }

  function resetForm() {
    setCreating(false); setError(null); setEdited(false); setVars(null)
    setForm({ title: '', templateId: '', content: '', value: '', procedure: '', professional: '' })
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const sobras = unresolvedVariables(form.content)
    if (sobras.length) { setError(`O texto ainda tem campos sem valor: ${sobras.map((s) => `{{${s}}}`).join(', ')}`); return }
    const res = await fetch(`/api/patients/${patientId}/contracts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title, templateId: form.templateId || undefined, content: form.content,
        value: form.value ? Number(form.value) : undefined, variables: vars ?? undefined,
      }),
    })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Falha ao gerar contrato'); return }
    resetForm(); load()
  }

  async function cancel(id: string) {
    if (!confirm('Cancelar este contrato? O link enviado ao paciente deixa de funcionar.')) return
    const res = await fetch(`/api/clinico/contracts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELED' }) })
    if (!res.ok) { const er = await res.json().catch(() => ({})); setError(er.error || 'Não foi possível cancelar.') }
    load()
  }

  async function sendLink(c: any) {
    if (c.status === 'SENT' && !confirm('Enviar um novo link? O link anterior deixa de funcionar.')) return
    setBusyId(c.id); setError(null)
    try {
      const res = await fetch(`/api/clinico/contracts/${c.id}/sign-link`, { method: 'POST' })
      const b = await res.json()
      if (!res.ok) { setError(b?.error || 'Não foi possível gerar o link.'); return }
      setLinks((l) => ({ ...l, [c.id]: b }))
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function copy(id: string, link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(id); setTimeout(() => setCopied(null), 2000) } catch { /* sem permissão */ }
  }

  const visiveis = (rows ?? []).filter((c) =>
    filtro === 'todos' ? true : filtro === 'assinados' ? c.status === 'SIGNED' : c.status === 'DRAFT' || c.status === 'SENT')
  const nAssinados = (rows ?? []).filter((c) => c.status === 'SIGNED').length

  return (
    <SectionCard
      title="Contratos"
      description="Gere a partir de um modelo e colete a assinatura na clínica ou pelo WhatsApp"
      actions={canEdit && (creating
        ? <ActionButton variant="outline" icon={<ArrowLeft />} onClick={resetForm}>Voltar</ActionButton>
        : <ActionButton icon={<Plus />} onClick={() => setCreating(true)}>Novo contrato</ActionButton>)}
    >
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}

      {creating ? (
        <form onSubmit={create} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Modelo</label>
            <FilterSelect className="w-full" value={form.templateId} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— Sem modelo (texto livre) —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </FilterSelect>
            {templates.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum modelo cadastrado. Cadastre em <Link href="/clinico/contratos" className="underline">Clínico → Contratos</Link>.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Procedimento</label>
              <Input className="w-full" value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} placeholder="ex.: Avaliação inicial" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Valor (R$)</label>
              <Input type="number" step="0.01" className="w-full" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Profissional</label>
              <Input className="w-full" value={form.professional} onChange={(e) => setForm({ ...form, professional: e.target.value })} />
            </div>
          </div>
          {faltando.length > 0 && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              O modelo usa campos vazios: <strong>{faltando.join(', ')}</strong>. Complete o cadastro do paciente ou preencha direto no texto antes de gerar.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Título *</label>
            <Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <div className="mb-1 flex items-end justify-between gap-2">
              <label className="block text-sm font-medium text-foreground">
                Texto do contrato * <span className="text-xs font-normal text-muted-foreground">{template ? '(já preenchido com o cadastro do paciente)' : ''}</span>
              </label>
              {template && edited && (
                <button type="button" onClick={() => setEdited(false)} className="text-xs text-primary underline">Refazer a partir do modelo</button>
              )}
            </div>
            <Textarea className="w-full font-normal" rows={16} value={form.content}
              onChange={(e) => { setEdited(true); setForm({ ...form, content: e.target.value }) }} required />
            <p className="mt-1 text-xs text-muted-foreground">Depois de enviado ao paciente, o texto fica travado.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="submit" className="px-4 py-2 text-sm text-primary-foreground bg-primary rounded-md hover:bg-primary/90">Gerar contrato</button>
          </div>
        </form>
      ) : rows === null ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato gerado.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar contratos">
            {([['todos', 'Todos'], ['pendentes', 'Aguardando assinatura'], ['assinados', `Assinados (${nAssinados})`]] as [Filtro, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          {visiveis.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada aqui.</p>
          ) : (
            <div className="divide-y divide-border">
              {visiveis.map((c) => {
                const aberto = c.status === 'DRAFT' || c.status === 'SENT'
                const li = links[c.id]
                return (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{c.title}</span>
                          <StatusBadge tone={STATUS_TONE[c.status]}>{CONTRACT_STATUS_LABELS[c.status] || c.status}</StatusBadge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.value != null ? `R$ ${Number(c.value).toFixed(2)} · ` : ''}
                          {c.status === 'SIGNED' && c.signedAt
                            ? `Assinado em ${fmtDateTime(c.signedAt)} · ${c.signMethod === 'IN_PERSON' ? 'presencial' : 'pelo WhatsApp'}`
                            : c.status === 'SENT' && c.sentAt
                              ? `Link enviado em ${fmtDateTime(c.sentAt)}${c.viewedAt ? ' · paciente já abriu' : ''}${c.signLinkActive ? '' : ' · link expirado'}`
                              : `Criado em ${new Date(c.createdAt).toLocaleDateString('pt-BR')}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        {c.status === 'SIGNED' && c.hasSignedPdf && (
                          <a href={`/api/clinico/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
                            <Download className="h-3.5 w-3.5" /> PDF assinado
                          </a>
                        )}
                        {canEdit && aberto && (
                          <>
                            <Link href={`/clinico/contratos/assinar/${c.id}`}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                              <PenLine className="h-3.5 w-3.5" /> Assinar presencialmente
                            </Link>
                            <button onClick={() => sendLink(c)} disabled={busyId === c.id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60">
                              <Send className="h-3.5 w-3.5" /> {busyId === c.id ? 'Enviando…' : c.status === 'SENT' ? 'Reenviar link' : 'Enviar no WhatsApp'}
                            </button>
                            <button onClick={() => cancel(c.id)} title="Cancelar contrato" aria-label="Cancelar contrato"
                              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {li && (
                      <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
                        <p className={li.sent ? 'text-foreground' : 'text-destructive'}>
                          {li.sent ? `Enviado no WhatsApp ${li.sentTo}.` : `Link gerado, mas o WhatsApp não enviou: ${li.error}. Copie e envie por outro meio.`}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-muted-foreground">{li.link}</code>
                          <button onClick={() => copy(c.id, li.link)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted">
                            {copied === c.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === c.id ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
