'use client'

import { usePathname } from 'next/navigation'
import { TabsNav } from '@/components/ui/tabs'
import { financialCan, payableCan } from '@/lib/financial-caps'

// Abas do módulo financeiro. A aba "Pagar" só aparece para quem tem acesso a
// Contas a Pagar (OWNER/MANAGER/FINANCE) — recepção não vê despesas.
export function FinanceTabs({ role }: { role: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/financeiro/dashboard', label: 'Dashboard', show: payableCan(role, 'view') },
    { href: '/financeiro', label: 'Receber', show: true },
    { href: '/financeiro/inadimplencia', label: 'Inadimplência', show: financialCan(role, 'view') },
    { href: '/financeiro/pagar', label: 'Pagar', show: payableCan(role, 'view') },
    { href: '/financeiro/fluxo-caixa', label: 'Fluxo de caixa', show: payableCan(role, 'view') },
    { href: '/financeiro/categorias', label: 'Categorias', show: financialCan(role, 'view') || payableCan(role, 'view') },
    { href: '/financeiro/centros-custo', label: 'Centros de custo', show: payableCan(role, 'view') },
    { href: '/financeiro/fornecedores', label: 'Fornecedores', show: payableCan(role, 'view') },
  ].filter((t) => t.show)

  // "Receber" é o fallback: ativo quando NÃO está numa sub-rota específica.
  const SUBROUTES = ['/financeiro/pagar', '/financeiro/categorias', '/financeiro/centros-custo', '/financeiro/fornecedores', '/financeiro/fluxo-caixa', '/financeiro/dashboard', '/financeiro/inadimplencia']
  const isReceber = !SUBROUTES.some((p) => pathname.startsWith(p))

  const items = tabs.map((t) => ({
    href: t.href,
    label: t.label,
    active: t.href === '/financeiro' ? isReceber : pathname.startsWith(t.href),
  }))

  return <TabsNav items={items} className="mb-6" />
}
