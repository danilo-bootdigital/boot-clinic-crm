'use client'

import { useEffect, useState } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { Input } from '@/components/ui/input'

// Especialidades que a clínica atende.
//
// É o catálogo do qual o cadastro do médico escolhe (um médico pode ter mais de
// uma). Fica em Configurações porque é decisão da clínica, não do dia a dia da
// recepção — e porque é pré-requisito dos dois passos seguintes: cadastrar o
// médico e agendar.
//
// Excluir é bloqueado pela API quando há médico ou agendamento usando: sem isso
// o agendamento apontaria para uma especialidade que não existe mais
// (Appointment.specialtyId é obrigatório).

interface Specialty {
  id: string
  name: string
  description?: string | null
}

export default function SpecialtiesSettings() {
  const [items, setItems] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nova, setNova] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  async function carregar() {
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch('/api/specialties')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao carregar especialidades')
      setItems(Array.isArray(body) ? body : [])
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    const name = nova.trim()
    if (!name) return
    setBusy(true)
    setErro(null)
    setAviso(null)
    try {
      const res = await fetch('/api/specialties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao cadastrar')
      setItems((prev) => [...prev, body].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setNova('')
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function renomear(id: string) {
    const name = editNome.trim()
    if (!name) return
    setBusy(true)
    setErro(null)
    try {
      const res = await fetch(`/api/specialties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao renomear')
      setItems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, name: body.name } : s)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      )
      setEditId(null)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function excluir(s: Specialty) {
    setBusy(true)
    setErro(null)
    setAviso(null)
    try {
      const res = await fetch(`/api/specialties/${s.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        // 409 = em uso. A mensagem da API já diz por quem, e é acionável.
        setAviso(body?.error ?? 'Não foi possível excluir')
        return
      }
      setItems((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title="Especialidades atendidas"
      description="O que a clínica atende. O cadastro do(a) médico(a) escolhe daqui — e um(a) médico(a) pode ter mais de uma."
    >
      <div className="space-y-4">
        <form onSubmit={cadastrar} className="flex flex-wrap gap-2">
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Nova especialidade (ex.: Quiropraxia)"
            maxLength={60}
            className="min-w-[220px] flex-1"
          />
          <button
            type="submit"
            disabled={busy || !nova.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Cadastrar
          </button>
        </form>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {aviso && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{aviso}</p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {!loading && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                {editId === s.id ? (
                  <>
                    <Input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      maxLength={60}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => renomear(s.id)}
                      disabled={busy}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(s.id)
                        setEditNome(s.name)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(s)}
                      disabled={busy}
                      className="text-xs text-destructive hover:underline disabled:opacity-60"
                    >
                      Excluir
                    </button>
                  </>
                )}
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</li>
            )}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Especialidade em uso por médico(a) ou agendamento não pode ser excluída — renomeie, ou desvincule primeiro.
        </p>
      </div>
    </SectionCard>
  )
}
