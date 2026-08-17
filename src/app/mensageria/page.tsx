'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import MessagingCentral from '@/components/mensageria/MessagingCentral'

/**
 * Central de atendimento (WhatsApp e demais canais).
 *
 * A página não desenha cabeçalho nem cartão: a rota é full-bleed no AppShell
 * (ver FULL_ROUTES) e a central ocupa toda a área abaixo da topbar, com a lista
 * e a thread rolando cada uma no seu painel. Identidade da tela (título,
 * "Nova conversa", aviso de integração) vive dentro da própria central, onde o
 * atendente está olhando.
 */
export default function MensageriaPage() {
  const router = useRouter()

  useEffect(() => {
    // Sessão expirada no meio do atendimento: volta para o login já sabendo
    // para onde retornar.
    fetch('/api/mensageria/conversations').then((r) => {
      if (r.status === 401) router.push('/login?redirect=/mensageria')
    })
  }, [router])

  return (
    <div className="h-full min-h-0">
      <MessagingCentral />
    </div>
  )
}
