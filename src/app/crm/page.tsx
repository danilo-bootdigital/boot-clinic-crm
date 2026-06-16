'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, ArrowLeft, Target } from 'lucide-react'
import KanbanBoard from '@/components/crm/KanbanBoard'
import DealForm from '@/components/crm/DealForm'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { LoadingState } from '@/components/ui/loading-state'
import { ActionButton } from '@/components/ui/action-button'

type Mode = 'board' | 'create' | 'edit'

export default function CRMPage() {
  const router = useRouter()
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('board')
  const [selected, setSelected] = useState<any | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPipeline = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/pipelines', { cache: 'no-store' })
      if (res.status === 401) {
        router.push('/login?redirect=/crm')
        return
      }
      if (!res.ok) throw new Error('Falha ao carregar pipeline')
      const data = await res.json()
      setPipelineId(data?.[0]?.id ?? null)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar pipeline')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadPipeline()
  }, [loadPipeline])

  async function handleSave(data: any) {
    setError(null)
    try {
      const isEdit = mode === 'edit' && selected?.id
      const res = await fetch(isEdit ? `/api/crm/deals/${selected.id}` : '/api/crm/deals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao salvar oportunidade')
      }
      setMode('board')
      setSelected(null)
      setRefreshKey((k) => k + 1)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM — Pipeline de Vendas"
        description={mode === 'board' ? 'Gestão de oportunidades e negócios da clínica' : undefined}
        icon={<Target className="h-5 w-5" />}
        actions={
          mode === 'board' ? (
            <ActionButton icon={<Plus />} onClick={() => { setSelected(null); setMode('create') }}>
              Nova Oportunidade
            </ActionButton>
          ) : (
            <ActionButton variant="outline" icon={<ArrowLeft />} onClick={() => { setMode('board'); setSelected(null); setError(null) }}>
              Voltar
            </ActionButton>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {mode === 'board' && (
        loading ? (
          <LoadingState rows={4} label="Carregando pipeline" />
        ) : pipelineId ? (
          <KanbanBoard
            key={refreshKey}
            pipelineId={pipelineId}
            onDealClick={(deal) => { setSelected(deal); setMode('edit') }}
          />
        ) : (
          <SectionCard><p className="text-sm text-muted-foreground">Nenhum pipeline disponível.</p></SectionCard>
        )
      )}

      {(mode === 'create' || mode === 'edit') && (
        <SectionCard>
          <DealForm
            deal={mode === 'edit' ? selected : undefined}
            onSubmit={handleSave}
            onCancel={() => { setMode('board'); setSelected(null) }}
          />
        </SectionCard>
      )}
    </div>
  )
}
