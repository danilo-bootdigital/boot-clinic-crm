'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'

interface Props {
  title: string
  description: string
  icon: React.ReactNode
  endpoint: string
  /** rótulo do recurso no estado vazio (ex.: "anamnese") */
  emptyLabel: string
  /** renderiza o conteúdo de uma linha (sem o link do paciente) */
  renderRow: (row: any) => React.ReactNode
}

// Lista global de um recurso clínico da clínica. Cada linha leva ao paciente.
export default function ClinicalListView({ title, description, icon, endpoint, emptyLabel, renderRow }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' }).then(async (res) => {
      if (res.status === 401) { router.push('/login?redirect=/clinico'); return }
      if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error || `Erro ${res.status}`); setRows([]); return }
      setRows(await res.json())
    }).catch(() => { setError('Falha ao carregar'); setRows([]) })
  }, [endpoint, router])

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} icon={icon} />
      {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {rows === null ? (
        <LoadingState rows={5} />
      ) : rows.length === 0 ? (
        <SectionCard><p className="text-sm text-muted-foreground">Nenhum(a) {emptyLabel} registrado(a). Crie a partir da ficha do paciente.</p></SectionCard>
      ) : (
        <SectionCard flush>
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">{renderRow(row)}</div>
                {row.patientId && (
                  <Link href={`/pacientes/${row.patientId}`} className="shrink-0 text-sm text-blue-600 hover:underline">
                    {row.patientName || 'Ver paciente'}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
