'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, ShieldCheck, Download } from 'lucide-react'
import { SignaturePad } from '@/components/contracts/SignaturePad'
import { ContractDocument, maskCpfInput } from '@/components/contracts/ContractDocument'

// Página pública de assinatura (link enviado no WhatsApp). Sem login.
// Ordem pensada para o celular: ler → confirmar CPF → receber código → assinar.

type Info = {
  title: string
  content: string
  status: 'SENT' | 'SIGNED'
  signedAt: string | null
  patientFirstName: string
  clinicName: string
  clinicLogo: string | null
  phoneMasked: string
  codeSent: boolean
  sendsLeft: number
}

export default function AssinarContratoPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [cpf, setCpf] = useState('')
  const [code, setCode] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [codeInfo, setCodeInfo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState<'code' | 'sign' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/public/contracts/${token}`, { cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b?.error || 'Link inválido ou expirado.')
        setInfo(b)
        setDone(b.status === 'SIGNED')
      })
      .catch((e) => setInvalid(e.message))
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode() {
    setBusy('code'); setErr(null)
    try {
      const r = await fetch(`/api/public/contracts/${token}/otp`, { method: 'POST' })
      const b = await r.json()
      if (!r.ok) {
        setErr(b?.error || 'Não foi possível enviar o código.')
        if (b?.retryIn) setCooldown(b.retryIn)
        return
      }
      setCodeInfo(`Enviamos um código de 6 dígitos para o WhatsApp ${b.sentTo}. Ele vale ${b.expiresInMinutes} minutos.`)
      setCooldown(b.retryIn ?? 60)
    } catch {
      setErr('Falha de conexão. Tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  async function sign() {
    setBusy('sign'); setErr(null)
    try {
      const r = await fetch(`/api/public/contracts/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, cpf, signature, accepted }),
      })
      const b = await r.json()
      if (!r.ok) { setErr(b?.error || 'Não foi possível assinar.'); return }
      setDone(true)
    } catch {
      setErr('Falha de conexão. Tente novamente.')
    } finally {
      setBusy(null)
    }
  }

  const ready = cpf.replace(/\D/g, '').length === 11 && /^\d{6}$/.test(code) && !!signature && accepted

  if (invalid) {
    return (
      <Shell>
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
          <p className="text-base font-semibold text-foreground">Link indisponível</p>
          <p className="mt-2 text-sm text-muted-foreground">{invalid}</p>
        </div>
      </Shell>
    )
  }

  if (!info) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando contrato…
        </div>
      </Shell>
    )
  }

  return (
    <Shell clinicName={info.clinicName} clinicLogo={info.clinicLogo}>
      {done ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <p className="mt-3 text-base font-semibold text-foreground">Contrato assinado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Obrigado, {info.patientFirstName}. A {info.clinicName} já recebeu sua assinatura.
          </p>
          <a
            href={`/api/public/contracts/${token}/pdf`}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Download className="h-4 w-4" /> Baixar minha cópia (PDF)
          </a>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Olá, {info.patientFirstName}. Leia o contrato até o fim e, se estiver de acordo, assine abaixo.
          </p>

          <ContractDocument title={info.title} content={info.content} />

          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-base font-semibold text-foreground">Assinar</h2>

            <div>
              <label htmlFor="cpf" className="mb-1 block text-sm font-medium text-foreground">Seu CPF</label>
              <input
                id="cpf" inputMode="numeric" autoComplete="off" value={cpf}
                onChange={(e) => setCpf(maskCpfInput(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground"
              />
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-foreground">Código de confirmação</span>
              <p className="mb-2 text-xs text-muted-foreground">
                Enviamos para o WhatsApp {info.phoneMasked}, o mesmo do seu cadastro na clínica.
              </p>
              <div className="flex gap-2">
                <input
                  aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-32 rounded-lg border border-border bg-background px-3 py-2.5 text-center text-base tracking-[0.3em] text-foreground"
                />
                <button
                  type="button" onClick={sendCode} disabled={busy !== null || cooldown > 0}
                  className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                >
                  {busy === 'code' ? 'Enviando…' : cooldown > 0 ? `Reenviar em ${cooldown}s` : codeInfo || info.codeSent ? 'Reenviar código' : 'Receber código no WhatsApp'}
                </button>
              </div>
              {codeInfo && <p className="mt-2 text-xs text-muted-foreground">{codeInfo}</p>}
            </div>

            <div>
              <span className="mb-1 block text-sm font-medium text-foreground">Sua assinatura</span>
              <SignaturePad onChange={setSignature} disabled={busy === 'sign'} />
            </div>

            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Li o contrato e concordo com todos os termos. Reconheço esta assinatura eletrônica como válida.</span>
            </label>

            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}

            <button
              type="button" onClick={sign} disabled={!ready || busy !== null}
              className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === 'sign' ? 'Assinando…' : 'Assinar contrato'}
            </button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Registramos data, hora, IP e dispositivo junto com a assinatura.
            </p>
          </section>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children, clinicName, clinicLogo }: { children: React.ReactNode; clinicName?: string; clinicLogo?: string | null }) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {clinicName && (
          <div className="mb-5 flex items-center gap-3">
            {clinicLogo ? (
              <img src={clinicLogo} alt="" className="h-10 w-10 rounded-lg object-contain" />
            ) : null}
            <span className="text-base font-semibold text-foreground">{clinicName}</span>
          </div>
        )}
        {children}
      </div>
    </main>
  )
}
