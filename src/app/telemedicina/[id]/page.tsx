'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Video, ArrowLeft, Play, Pause, Square, Send, Paperclip, Stethoscope,
  MessageSquare, Copy, Phone, FileText, ClipboardList, FileSignature, Receipt, Image as ImageIcon, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'

const STATUS_LABEL: Record<string, string> = {
  AGENDADA: 'Agendada', AGUARDANDO_PACIENTE: 'Aguardando paciente', PACIENTE_ENTROU: 'Paciente entrou',
  MEDICO_ENTROU: 'Médico entrou', EM_ATENDIMENTO: 'Em atendimento', PAUSADA: 'Pausada',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', NAO_COMPARECEU: 'Não compareceu',
}

type Detail = any

const TABS = [
  { key: 'dados', label: 'Dados', icon: Stethoscope },
  { key: 'timeline', label: 'Histórico', icon: Clock },
  { key: 'anamneses', label: 'Anamnese', icon: ClipboardList, gate: 'canAnamnese' },
  { key: 'records', label: 'Prontuário', icon: FileText, gate: 'canProntuario' },
  { key: 'contracts', label: 'Contratos', icon: FileSignature, gate: 'canContratos' },
  { key: 'quotes', label: 'Orçamentos', icon: Receipt, gate: 'canOrcamentos' },
  { key: 'images', label: 'Imagens', icon: ImageIcon, gate: 'canImagens' },
  { key: 'pastAppointments', label: 'Consultas', icon: Video },
]

export default function ConsultaPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Detail | null>(null)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [tab, setTab] = useState('dados')
  const [chatText, setChatText] = useState('')
  const [recordTitle, setRecordTitle] = useState('')
  const [recordContent, setRecordContent] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch(`/api/telemedicine/sessions/${id}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null))
  }, [id])

  useEffect(() => { load() }, [load])

  const session = data?.session
  const access = data?.access || {}

  async function transition(status: string, reason?: string) {
    setBusy(true)
    await fetch(`/api/telemedicine/sessions/${id}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }),
    })
    setBusy(false); load()
  }

  async function joinRoom() {
    setBusy(true)
    const r = await fetch(`/api/telemedicine/sessions/${id}/join`, { method: 'POST' })
    if (r.ok) { const j = await r.json(); setRoomUrl(j.roomUrl) }
    setBusy(false); load()
  }

  async function sendChat() {
    if (!chatText.trim()) return
    await fetch(`/api/telemedicine/sessions/${id}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: chatText }),
    })
    setChatText(''); load()
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('phase', 'DURING')
    await fetch(`/api/telemedicine/sessions/${id}/attachments`, { method: 'POST', body: fd })
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  async function saveRecord() {
    if (!recordTitle.trim() || !recordContent.trim()) return
    setBusy(true)
    const r = await fetch(`/api/telemedicine/sessions/${id}/record`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: recordTitle, content: recordContent }),
    })
    setBusy(false)
    if (r.ok) { setRecordTitle(''); setRecordContent(''); load() }
  }

  async function notify(event: string) {
    await fetch(`/api/telemedicine/sessions/${id}/notify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }),
    })
    load()
  }

  if (data === null) return <LoadingState rows={6} />

  const ctx = data.context || {}
  const isTerminal = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'].includes(session?.status)
  const visibleTabs = TABS.filter((t) => !t.gate || access[t.gate])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/telemedicina"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Video className="h-5 w-5 text-primary" /> {data.patient?.name || 'Paciente'}</h1>
            <p className="text-xs text-muted-foreground">
              {data.professional?.name} · {session && new Date(session.scheduledAt).toLocaleString('pt-BR')} · <span className="font-medium">{STATUS_LABEL[session?.status] || session?.status}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {session?.patientLink && (
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(session.patientLink)}><Copy className="mr-1 h-3.5 w-3.5" /> Link do paciente</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => notify('STARTING')}><Phone className="mr-1 h-3.5 w-3.5" /> Enviar link (WhatsApp)</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna principal: sala + controles + chat + anexos + prontuário */}
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="aspect-video bg-black">
              {roomUrl ? (
                <iframe src={roomUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-full w-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-white/80">
                  <Video className="h-10 w-10" />
                  <p className="text-sm">{isTerminal ? 'Consulta encerrada' : 'A sala de vídeo abrirá aqui'}</p>
                  {!isTerminal && <Button onClick={joinRoom} disabled={busy}><Play className="mr-1 h-4 w-4" /> Entrar na sala</Button>}
                </div>
              )}
            </div>
            {!isTerminal && (
              <div className="flex flex-wrap gap-2 border-t border-border p-3">
                <Button size="sm" variant="outline" onClick={() => transition('EM_ATENDIMENTO')} disabled={busy}><Play className="mr-1 h-3.5 w-3.5" /> Iniciar atendimento</Button>
                <Button size="sm" variant="outline" onClick={() => transition('PAUSADA')} disabled={busy}><Pause className="mr-1 h-3.5 w-3.5" /> Pausar</Button>
                <Button size="sm" variant="outline" onClick={() => transition('FINALIZADA')} disabled={busy}><Square className="mr-1 h-3.5 w-3.5" /> Finalizar</Button>
                <Button size="sm" variant="outline" onClick={() => transition('NAO_COMPARECEU')} disabled={busy}>Não compareceu</Button>
                <Button size="sm" variant="outline" onClick={() => transition('CANCELADA', 'Cancelada pelo profissional')} disabled={busy}>Cancelar</Button>
              </div>
            )}
          </div>

          {/* Prontuário da consulta */}
          {access.canProntuario && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Evolução clínica (prontuário)</h3>
              <input value={recordTitle} onChange={(e) => setRecordTitle(e.target.value)} placeholder="Título" className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              <textarea value={recordContent} onChange={(e) => setRecordContent(e.target.value)} placeholder="Descreva a evolução do atendimento…" rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              <div className="mt-2 flex justify-end"><Button size="sm" onClick={saveRecord} disabled={busy}>Salvar no prontuário</Button></div>
            </div>
          )}

          {/* Chat + anexos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Chat</h3>
              <div className="mb-2 max-h-48 space-y-2 overflow-y-auto text-sm">
                {(data.chat || []).map((m: any) => (
                  <div key={m.id} className="rounded-md bg-muted/50 px-2 py-1"><span className="font-medium">{m.senderName}: </span>{m.body}</div>
                ))}
                {(data.chat || []).length === 0 && <p className="text-xs text-muted-foreground">Sem mensagens.</p>}
              </div>
              <div className="flex gap-2">
                <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Mensagem…" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
                <Button size="icon" onClick={sendChat}><Send className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Anexos</h3>
              <div className="mb-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                {(data.attachments || []).map((a: any) => (
                  <a key={a.id} href={a.url || '#'} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">{a.title}</a>
                ))}
                {(data.attachments || []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum anexo.</p>}
              </div>
              <input ref={fileRef} type="file" onChange={uploadFile} className="block w-full text-xs" />
            </div>
          </div>
        </div>

        {/* Coluna lateral: contexto do paciente (sem trocar de tela) */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            {visibleTabs.map((t) => {
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                  <Icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              )
            })}
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto p-4 text-sm">
            {tab === 'dados' && (
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Nome:</span> {data.patient?.name}</p>
                <p><span className="text-muted-foreground">Telefone:</span> {data.patient?.phone}</p>
                <p><span className="text-muted-foreground">E-mail:</span> {data.patient?.email || '—'}</p>
                <div className="flex flex-wrap gap-1 pt-2">
                  {(data.patient?.tags || []).map((tg: any) => (
                    <span key={tg.id} className="rounded-full px-2 py-0.5 text-xs" style={{ background: `${tg.color}20`, color: tg.color }}>{tg.name}</span>
                  ))}
                </div>
              </div>
            )}
            {tab === 'timeline' && <ContextList items={ctx.timeline} render={(e: any) => <><b>{e.title}</b> · {new Date(e.createdAt).toLocaleDateString('pt-BR')}</>} empty="Sem histórico." />}
            {tab === 'anamneses' && <ContextList items={ctx.anamneses} render={(a: any) => <><b>{a.title}</b> · {a.status}</>} empty="Sem anamneses." />}
            {tab === 'records' && <ContextList items={ctx.records} render={(r: any) => <><b>{r.title}</b> · {new Date(r.createdAt).toLocaleDateString('pt-BR')}<br /><span className="text-muted-foreground">{r.content?.slice(0, 120)}</span></>} empty="Sem registros." />}
            {tab === 'contracts' && <ContextList items={ctx.contracts} render={(c: any) => <><b>{c.title || 'Contrato'}</b> · {c.status}</>} empty="Sem contratos." />}
            {tab === 'quotes' && <ContextList items={ctx.quotes} render={(q: any) => <><b>{q.title || 'Orçamento'}</b> · {q.status}</>} empty="Sem orçamentos." />}
            {tab === 'images' && <ContextList items={ctx.images} render={(i: any) => <>{i.description || i.category}</>} empty="Sem imagens." />}
            {tab === 'pastAppointments' && <ContextList items={ctx.pastAppointments} render={(a: any) => <>{new Date(a.startAt).toLocaleDateString('pt-BR')} · {a.type} · {a.status}</>} empty="Sem consultas anteriores." />}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContextList({ items, render, empty }: { items: any[]; render: (x: any) => React.ReactNode; empty: string }) {
  if (!items || items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>
  return (
    <ul className="space-y-2">
      {items.map((x: any) => <li key={x.id} className="rounded-md bg-muted/40 px-2 py-1.5">{render(x)}</li>)}
    </ul>
  )
}
