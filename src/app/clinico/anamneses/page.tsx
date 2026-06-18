'use client'

import { ClipboardList } from 'lucide-react'
import ClinicalListView from '@/components/clinical/ClinicalListView'
import { StatusBadge } from '@/components/ui/status-badge'
import { ANAMNESIS_STATUS_LABELS } from '@/lib/validations/clinical'

const TONE: Record<string, any> = { DRAFT: 'warning', FILLED: 'info', REVIEWED: 'success', ARCHIVED: 'neutral' }

export default function AnamnesesPage() {
  return (
    <ClinicalListView
      title="Anamneses" description="Todas as anamneses da clínica" icon={<ClipboardList className="h-5 w-5" />}
      endpoint="/api/clinico/anamneses" emptyLabel="anamnese"
      renderRow={(a) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{a.title}</span>
          <StatusBadge tone={TONE[a.status]}>{ANAMNESIS_STATUS_LABELS[a.status] || a.status}</StatusBadge>
          <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
    />
  )
}
