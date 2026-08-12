'use client'

import { FlaskConical } from 'lucide-react'
import ClinicalListView from '@/components/clinical/ClinicalListView'

// Lista global dos pedidos de exame da clínica. A EMISSÃO acontece na ficha do
// paciente (ou no atendimento de telemedicina), porque um pedido precisa de
// paciente — aqui é a visão de acompanhamento, no mesmo padrão das outras
// listas clínicas.
export default function PedidosExamePage() {
  return (
    <ClinicalListView
      title="Pedidos de exames"
      description="Solicitações de exames emitidas pela clínica"
      icon={<FlaskConical className="h-5 w-5" />}
      endpoint="/api/clinico/exames"
      emptyLabel="pedido de exames"
      renderRow={(p) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {p.totalExames} {p.totalExames === 1 ? 'exame' : 'exames'}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {p.professionalName}
            {p.professionalCrm ? ` — ${p.professionalCrm}` : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(p.issuedAt).toLocaleDateString('pt-BR')}
          </span>
          {p.origin === 'TELEMEDICINE' && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              telemedicina
            </span>
          )}
        </div>
      )}
    />
  )
}
