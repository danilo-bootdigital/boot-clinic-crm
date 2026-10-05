'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Download, Loader2 } from 'lucide-react'
import { SignaturePad } from '@/components/contracts/SignaturePad'
import { ContractDocument, maskCpfInput } from '@/components/contracts/ContractDocument'

// Assinatura PRESENCIAL: a atendente abre esta tela no tablet/celular da clínica
// e entrega ao paciente. Tela cheia (sem menu do CRM) para o paciente não sair
// navegando pelo sistema. Sem código no WhatsApp — quem confere a identidade é
// a atendente, que fica registrada no PDF como quem conduziu.

type Contract = { id: string; title: string; content: string; status: string; patientId: string }

export default function AssinaturaPresencialPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [c, setC] = useState<Contract | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [cpf, setCpf] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/clinico/contracts/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b?.error || 'Contrato não encontrado.')
        setC(b)
        setDone(b.status === 'SIGNED')
      })
      .catch((e) => setLoadErr(e.message))
  }, [id])

  async function sign() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/clinico/contracts/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, signature, accepted }),
      })
      const b = await r.json()
      if (!r.ok) { setErr(b?.error || 'Não foi possível assinar.'); return }
      setDone(true)
    } catch {
      setErr('Falha de conexão. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  const back = () => (c ? router.push(`/pacientes/${c.patientId}?tab=contratos`) : router.back())
  const ready = cpf.replace(/\D/g, '').length === 11 && !!signature && accepted
  const blocked = c && (c.status === 'CANCELED')

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <button onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar ao paciente
        </button>

        {loadErr ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">{loadErr}</p>
        ) : !c ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando contrato…
          </div>
        ) : done ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <p className="mt-3 text-base font-semibold text-foreground">Contrato assinado</p>
            <p className="mt-1 text-sm text-muted-foreground">O PDF assinado já está na pasta de contratos do paciente.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={`/api/clinico/contracts/${id}/pdf`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
                <Download className="h-4 w-4" /> Baixar PDF
              </a>
              <button onClick={back} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Voltar ao paciente
              </button>
            </div>
          </div>
        ) : blocked ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Este contrato foi cancelado e não pode ser assinado.</p>
        ) : (
          <div className="space-y-5">
            <ContractDocument title={c.title} content={c.content} />
            <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-card">
              <h2 className="text-base font-semibold text-foreground">Assinatura do paciente</h2>
              <div>
                <label htmlFor="cpf" className="mb-1 block text-sm font-medium text-foreground">CPF do paciente</label>
                <input id="cpf" inputMode="numeric" autoComplete="off" value={cpf}
                  onChange={(e) => setCpf(maskCpfInput(e.target.value))} placeholder="000.000.000-00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground" />
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-foreground">Assinatura</span>
                <SignaturePad onChange={setSignature} disabled={busy} />
              </div>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>Li o contrato e concordo com todos os termos. Reconheço esta assinatura eletrônica como válida.</span>
              </label>
              {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
              <button type="button" onClick={sign} disabled={!ready || busy}
                className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? 'Assinando…' : 'Assinar contrato'}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
