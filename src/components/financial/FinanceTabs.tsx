'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { financialCan, payableCan } from '@/lib/financial-caps'

// Abas do módulo financeiro. A aba "Pagar" só aparece para quem tem acesso a
// Contas a Pagar (OWNER/MANAGER/FINANCE) — recepção não vê despesas.
export function FinanceTabs({ role }: { role: string }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/financeiro/dashboard', label: 'Dashboard', show: payableCan(role, 'view') },
    { href: '/financeiro', label: 'Receber', show: true },
    { href: '/financeiro/pagar', label: 'Pagar', show: payableCan(role, 'view') },
    { href: '/financeiro/fluxo-caixa', label: 'Fluxo de caixa', show: payableCan(role, 'view') },
    { href: '/financeiro/categorias', label: 'Categorias', show: financialCan(role, 'view') || payableCan(role, 'view') },
    { href: '/financeiro/centros-custo', label: 'Centros de custo', show: payableCan(role, 'view') },
    { href: '/financeiro/fornecedores', label: 'Fornecedores', show: payableCan(role, 'view') },
  ].filter((t) => t.show)

  // "Receber" é o fallback: ativo quando NÃO está numa sub-rota específica.
  const SUBROUTES = ['/financeiro/pagar', '/financeiro/categorias', '/financeiro/centros-custo', '/financeiro/fornecedores', '/financeiro/fluxo-caixa', '/financeiro/dashboard']
  const isReceber = !SUBROUTES.some((p) => pathname.startsWith(p))

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = t.href === '/financeiro' ? isReceber : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
