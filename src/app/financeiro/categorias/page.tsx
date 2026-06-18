'use client'

import { useEffect, useState } from 'react'
import { Tags } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { FinanceTabs } from '@/components/financial/FinanceTabs'
import { CategoryManager } from '@/components/financial/CategoryManager'
import { financialCan, payableCan } from '@/lib/financial-caps'

// Fase 3 — gestão de categorias (receita e despesa). Receita: quem opera Contas
// a Receber. Despesa: quem opera Contas a Pagar (gating por capacidade).
export default function CategoriasPage() {
  const [role, setRole] = useState('')
  useEffect(() => { fetch('/api/me').then((r) => r.json()).then((m) => setRole(m?.role || '')) }, [])

  const canRevenue = financialCan(role, 'view')
  const canRevenueManage = financialCan(role, 'create')
  const canExpense = payableCan(role, 'view')
  const canExpenseManage = payableCan(role, 'create')

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <PageHeader title="Financeiro" description="Categorias" icon={<Tags className="h-5 w-5" />} />
      <FinanceTabs role={role} />

      <div className="grid gap-6 md:grid-cols-2">
        {canRevenue && (
          <CategoryManager title="Categorias de receita" endpoint="/api/financeiro/categories" canManage={canRevenueManage} />
        )}
        {canExpense && (
          <CategoryManager title="Categorias de despesa" endpoint="/api/financeiro/expense-categories" canManage={canExpenseManage} />
        )}
      </div>
    </div>
  )
}
