'use client'

import { useEffect, useState } from 'react'

// Biblioteca de painéis de exame do SaaS (Super-Admin).
//
// O painel de exames é conteúdo da PLATAFORMA, e é aplicado no catálogo de uma
// clínica por CÓPIA. Cópia, não vínculo: a clínica edita o dela sem afetar a
// biblioteca, e a biblioteca evolui sem reescrever o que já foi entregue.
//
// Existe porque a versão anterior semeava o painel de uma clínica em toda
// clínica que abrisse o módulo — espalhando a lista curada de um cliente.

interface Painel {
  id: string
  name: string
  description: string | null
  totalExames: number
}

interface Clinica {
  id: string
  name: string
}

export default function ExamPanelsPanel({
  companies,
  onClose,
}: {
  companies: Clinica[]
  onClose: () => void
}) {
  const [paineis, setPaineis] = useState<Painel[] | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Criar a partir do catálogo de uma clínica
  const [novoNome, setNovoNome] = useState('')
  const [origemId, setOrigemId] = useState('')

  // Aplicar em uma clínica
  const [aplicarPainelId, setAplicarPainelId] = useState('')
  const [aplicarClinicaId, setAplicarClinicaId] = useState('')
  const [substituir, setSubstituir] = useState(false)

  async function carregar() {
    const res = await fetch('/api/admin/exam-panels', { cache: 'no-store' })
    setPaineis(res.ok ? await res.json() : [])
  }

  useEffect(() => {
    carregar()
  }, [])

  async function criar() {
    if (!novoNome.trim() || !origemId) {
      setMsg({ type: 'err', text: 'Informe o nome do painel e a clínica de origem.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/exam-panels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: novoNome.trim(), fromCompanyId: origemId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: body?.error ?? 'Não foi possível criar o painel.' })
        return
      }
      setNovoNome('')
      setOrigemId('')
      setMsg({ type: 'ok', text: 'Painel criado na biblioteca.' })
      carregar()
    } finally {
      setBusy(false)
    }
  }

  async function aplicar() {
    if (!aplicarPainelId || !aplicarClinicaId) {
      setMsg({ type: 'err', text: 'Escolha o painel e a clínica.' })
      return
    }
    if (substituir && !confirm('Substituir o painel atual da clínica? Os pedidos já emitidos não mudam.')) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/exam-panels/${aplicarPainelId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: aplicarClinicaId, replace: substituir }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: body?.error ?? 'Não foi possível aplicar o painel.' })
        return
      }
      setMsg({
        type: 'ok',
        text: `Aplicado em ${body.clinica}: ${body.adicionados} exames adicionados${
          body.ignorados ? `, ${body.ignorados} já existiam` : ''
        }.`,
      })
    } finally {
      setBusy(false)
    }
  }

  async function remover(p: Painel) {
    if (!confirm(`Remover "${p.name}" da biblioteca? As clínicas que já receberam mantêm o painel delas.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/exam-panels/${p.id}`, { method: 'DELETE' })
      if (res.ok) carregar()
      else setMsg({ type: 'err', text: 'Não foi possível remover o painel.' })
    } finally {
      setBusy(false)
    }
  }

  const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-popover">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Painéis de exame</h2>
            <p className="text-sm text-muted-foreground">
              Biblioteca da plataforma. Aplicar copia o painel para o catálogo da clínica — depois
              disso ela edita o dela sem afetar a biblioteca.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Fechar
          </button>
        </div>

        {msg && (
          <p
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              msg.type === 'ok'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {msg.text}
          </p>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Biblioteca</h3>
          {paineis === null ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : paineis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum painel ainda. Crie um a partir do catálogo de uma clínica abaixo.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {paineis.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.totalExames} exames</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remover(p)}
                    disabled={busy}
                    className="text-xs text-destructive hover:underline disabled:opacity-60"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-5 rounded-lg border border-border p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Criar a partir de uma clínica</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            O conteúdo do painel de uma clínica é dela. Promover a base da plataforma é decisão de
            negócio — idealmente com autorização do cliente.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className={campo}
              placeholder="Nome do painel"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
            />
            <select className={campo} value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
              <option value="">Clínica de origem…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={criar}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Criar painel
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Aplicar em uma clínica</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className={campo}
              value={aplicarPainelId}
              onChange={(e) => setAplicarPainelId(e.target.value)}
            >
              <option value="">Painel…</option>
              {(paineis ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.totalExames})
                </option>
              ))}
            </select>
            <select
              className={campo}
              value={aplicarClinicaId}
              onChange={(e) => setAplicarClinicaId(e.target.value)}
            >
              <option value="">Clínica…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={aplicar}
              disabled={busy}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              Aplicar
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
            Substituir o painel atual da clínica (sem marcar, soma ao que já existe)
          </label>
        </section>
      </div>
    </div>
  )
}
