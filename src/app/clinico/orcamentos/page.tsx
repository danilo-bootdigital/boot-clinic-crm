'use client'

import { Receipt } from 'lucide-react'
import ClinicalListView from '@/components/clinical/ClinicalListView'
import { StatusBadge } from '@/components/ui/status-badge'
import { QUOTE_STATUS_LABELS } from '@/lib/validations/clinical'

const TONE: Record<string, any> = { DRAFT: 'warning', SENT: 'info', APPROVED: 'success', REJECTED: 'destructive' }

export default function OrcamentosPage() {
  return (
    <ClinicalListView
      title="Orçamentos" description="Orçamentos clínicos da clínica" icon={<Receipt className="h-5 w-5" />}
      endpoint="/api/clinico/quotes" emptyLabel="orçamento"
      renderRow={(q) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{q.title}</span>
          <StatusBadge tone={TONE[q.status]}>{QUOTE_STATUS_LABELS[q.status] || q.status}</StatusBadge>
          <span className="text-xs text-muted-foreground">Total R$ {Number(q.total || 0).toFixed(2)}</span>
        </div>
      )}
    />
  )
}
