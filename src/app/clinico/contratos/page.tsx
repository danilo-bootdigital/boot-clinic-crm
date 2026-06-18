'use client'

import { FileSignature } from 'lucide-react'
import ClinicalListView from '@/components/clinical/ClinicalListView'
import { StatusBadge } from '@/components/ui/status-badge'
import { CONTRACT_STATUS_LABELS } from '@/lib/validations/clinical'

const TONE: Record<string, any> = { DRAFT: 'warning', SENT: 'info', SIGNED: 'success', CANCELED: 'destructive' }

export default function ContratosPage() {
  return (
    <ClinicalListView
      title="Contratos" description="Contratos da clínica" icon={<FileSignature className="h-5 w-5" />}
      endpoint="/api/clinico/contracts" emptyLabel="contrato"
      renderRow={(c) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{c.title}</span>
          <StatusBadge tone={TONE[c.status]}>{CONTRACT_STATUS_LABELS[c.status] || c.status}</StatusBadge>
          <span className="text-xs text-muted-foreground">{c.value != null ? `R$ ${Number(c.value).toFixed(2)}` : ''}</span>
        </div>
      )}
    />
  )
}
