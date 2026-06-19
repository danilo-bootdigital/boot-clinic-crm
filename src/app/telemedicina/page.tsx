'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Video, Calendar, CheckCircle2, XCircle, UserX, Clock } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { LoadingState } from '@/components/ui/loading-state'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

type Session = {
  id: string
  status: string
  scheduledAt: string
  patient: { name: string } | null
  professional: { name: string } | null
  patientLink: string | null
}

type Dash = {
  totals: { total: number; finalizadas: number; canceladas: number; faltas: number; agendadas: number }
  avgDurationMin: number
  attendanceRate: number
  conversionRate: number
  byProfessional: { professionalId: string; name: string; count: number }[]
}

const STATUS_LABEL: Record<string, string> = {
  AGENDADA: 'Agendada', AGUARDANDO_PACIENTE: 'Aguardando paciente', PACIENTE_ENTROU: 'Paciente entrou',
  MEDICO_ENTROU: 'Médico entrou', EM_ATENDIMENTO: 'Em atendimento', PAUSADA: 'Pausada',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', NAO_COMPARECEU: 'Não compareceu',
}
const STATUS_TONE: Record<string, string> = {
  AGENDADA: 'bg-muted text-muted-foreground', AGUARDANDO_PACIENTE: 'bg-warning/15 text-warning',
  PACIENTE_ENTROU: 'bg-accent text-accent-foreground', MEDICO_ENTROU: 'bg-accent text-accent-foreground',
  EM_ATENDIMENTO: 'bg-success/15 text-success', PAUSADA: 'bg-warning/15 text-warning',
  FINALIZADA: 'bg-muted text-foreground', CANCELADA: 'bg-destructive/15 text-destructive',
  NAO_COMPARECEU: 'bg-destructive/15 text-destructive',
}

export default function TelemedicinaPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [dash, setDash] = useState<Dash | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(() => {
    const qs = filter ? `?status=${filter}` : ''
    fetch(`/api/telemedicine/sessions${qs}`).then((r) => (r.ok ? r.json() : [])).then(setSessions).catch(() => setSessions([]))
    fetch('/api/telemedicine/dashboard').then((r) => (r.ok ? r.json() : null)).then(setDash).catch(() => setDash(null))
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telemedicina"
        description="Centro de atendimento remoto — teleconsultas integradas à agenda, prontuário e WhatsApp"
        icon={<Video className="h-5 w-5" />}
        actions={<Link href="/agenda"><Button variant="outline">Agendar pela Agenda</Button></Link>}
      />

      {dash && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Realizadas (mês)" value={dash.totals.finalizadas} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
          <StatCard label="Comparecimento" value={`${dash.attendanceRate}%`} icon={<UserX className="h-5 w-5" />} tone="primary" hint={`${dash.totals.faltas} faltas`} />
          <StatCard label="Duração média" value={`${dash.avgDurationMin} min`} icon={<Clock className="h-5 w-5" />} tone="primary" />
          <StatCard label="Canceladas" value={dash.totals.canceladas} icon={<XCircle className="h-5 w-5" />} tone="destructive" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {['', 'AGENDADA', 'EM_ATENDIMENTO', 'FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {s ? STATUS_LABEL[s] : 'Todas'}
          </button>
        ))}
      </div>

      {sessions === null ? (
        <LoadingState rows={5} />
      ) : sessions.length === 0 ? (
        <EmptyState title="Nenhuma teleconsulta" description="Teleconsultas nascem da Agenda: crie uma consulta com modalidade Teleconsulta." icon={<Video className="h-6 w-6" />} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Profissional</th>
                <th className="px-4 py-3 font-medium">Horário</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.patient?.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.professional?.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(s.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[s.status] || 'bg-muted'}`}>{STATUS_LABEL[s.status] || s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/telemedicina/${s.id}`}><Button size="sm">Abrir</Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dash && dash.byProfessional.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Calendar className="h-4 w-4" /> Atendimentos por profissional (mês)</h3>
          <ul className="space-y-1 text-sm">
            {dash.byProfessional.map((p) => (
              <li key={p.professionalId} className="flex justify-between"><span>{p.name}</span><span className="font-medium">{p.count}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
