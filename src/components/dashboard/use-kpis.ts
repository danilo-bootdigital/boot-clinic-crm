'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Hook compartilhado: busca os KPIs reais da empresa para os dashboards.
export function useKpis() {
  const router = useRouter()
  const [kpis, setKpis] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/dashboard/kpis', { cache: 'no-store' })
      if (res.status === 401) { router.push('/login?redirect=/dashboard'); return }
      if (res.ok) setKpis(await res.json())
      setLoading(false)
    })()
  }, [router])

  return { kpis, loading }
}

export const brl = (n: number) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
