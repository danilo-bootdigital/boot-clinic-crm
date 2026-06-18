'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Video, ShieldCheck, Loader2 } from 'lucide-react'

type Info = {
  patientFirstName: string
  professionalName: string
  clinicName: string
  clinicLogo: string | null
  scheduledAt: string
  status: string
  ended: boolean
  consentRequired: boolean
  consentText: string | null
}

export default function TelePublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/public/telemedicine/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Info) => { setInfo(j); setAccepted(!j.consentRequired) })
      .catch(() => setNotFound(true))
  }, [slug])

  useEffect(() => { load() }, [load])

  async function acceptConsent() {
    setBusy(true); setErr(null)
    const r = await fetch(`/api/public/telemedicine/${slug}/consent`, { method: 'POST' })
    setBusy(false)
    if (r.ok) setAccepted(true)
    else setErr('Não foi possível registrar o aceite.')
  }

  async function join() {
    setBusy(true); setErr(null)
    const r = await fetch(`/api/public/telemedicine/${slug}/join`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (r.ok) setRoomUrl(j.roomUrl)
    else setErr(j.error || 'Não foi possível entrar na sala.')
  }

  if (notFound) return <Centered>Link inválido ou expirado.</Centered>
  if (!info) return <Centered><Loader2 className="h-6 w-6 animate-spin" /></Centered>
  if (info.ended) return <Centered>Esta teleconsulta já foi encerrada. Obrigado!</Centered>

  if (roomUrl) {
    return (
      <div className="flex h-screen w-screen flex-col bg-black">
        <div className="flex items-center justify-between px-4 py-2 text-sm text-white/80">
          <span>{info.clinicName} · Teleconsulta com {info.professionalName}</span>
        </div>
        <iframe src={roomUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="flex-1 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Video className="h-6 w-6" /></span>
          <div>
            <h1 className="text-lg font-semibold">Olá, {info.patientFirstName}!</h1>
            <p className="text-xs text-muted-foreground">{info.clinicName}</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-muted/50 p-3 text-sm">
          <p>Teleconsulta com <b>{info.professionalName}</b></p>
          <p className="text-muted-foreground">{new Date(info.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}</p>
        </div>

        {!accepted ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{info.consentText}</span>
            </div>
            <button onClick={acceptConsent} disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
              {busy ? 'Registrando…' : 'Li e concordo com o termo'}
            </button>
          </div>
        ) : (
          <button onClick={join} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} Entrar na teleconsulta
          </button>
        )}

        {err && <p className="mt-3 text-center text-xs text-red-600">{err}</p>}
        <p className="mt-4 text-center text-[11px] text-muted-foreground">Use um ambiente reservado e com boa conexão. Seus dados são protegidos conforme a LGPD.</p>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">{children}</div>
}
