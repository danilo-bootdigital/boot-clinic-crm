'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { CategoryManager } from '@/components/financial/CategoryManager'
import { payableCan } from '@/lib/financial-caps'

// Fase 4 — gestão de centros de custo (usados pelas despesas / Contas a Pagar).
// Restrito a quem opera Contas a Pagar (OWNER/MANAGER/FINANCE).
export default function CentrosCustoPage() {
  const [role, setRole] = useState('')
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((m) => setRole(m?.role || '')) }, [])

  const canView = payableCan(role, 'view')
  const canManage = payableCan(role, 'create')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Centros de custo" icon={<Building2 className="h-5 w-5" />} />
      <FinanceTabs role={role} />
      {canView ? (
        <CategoryManager title="Centros de custo" endpoint="/api/financeiro/cost-centers" canManage={canManage} />
      ) : (
        <EmptyState title="Sem acesso" description="Centros de custo são restritos a OWNER, MANAGER e Financeiro." />
      )}
    </div>
  )
}
