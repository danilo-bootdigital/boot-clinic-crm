'use client'

import { FileText } from 'lucide-react'
import ClinicalListView from '@/components/clinical/ClinicalListView'
import { StatusBadge } from '@/components/ui/status-badge'
import { RECORD_TYPE_LABELS } from '@/lib/validations/clinical'

export default function ProntuarioPage() {
  return (
    <ClinicalListView
      title="Prontuário" description="Registros de prontuário da clínica" icon={<FileText className="h-5 w-5" />}
      endpoint="/api/clinico/medical-records" emptyLabel="registro"
      renderRow={(r) => (
        <div className="flex items-center gap-2">
          <StatusBadge tone="info" dot={false}>{RECORD_TYPE_LABELS[r.type] || r.type}</StatusBadge>
          <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
          <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
    />
  )
}
