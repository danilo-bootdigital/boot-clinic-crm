'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Activity, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Só aceita caminhos internos relativos (evita open-redirect via ?redirect=).
function safeRedirect(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value
  return '/dashboard'
}

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = safeRedirect(searchParams.get('redirect'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Navegação que demora não pode virar spinner eterno: sem isto o usuário fica
  // preso numa tela sem saída e a única pista dele é ligar para o suporte.
  const [stalled, setStalled] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStalled(false)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

    // Navegação DURA, de propósito — não `router.push`.
    //
    // Com push o Next faz navegação suave: busca o RSC do destino e, quando o
    // destino é `/dashboard` (um server component que faz redirect para
    // /dashboard/executive), a cadeia tem que ser resolvida pelo router do
    // cliente. Com um `router.refresh()` concorrente invalidando o cache no meio
    // do caminho, no PRIMEIRO login — sem chunk nem cache aquecido — essa
    // corrida perde e a navegação morre com o botão travado em "Entrando…".
    //
    // O F5 que o usuário dava era exatamente isto: um request de documento
    // completo levando o cookie novo pelo middleware, com o redirect resolvido
    // no servidor. Agora o login faz esse request sozinho. Custa um
    // carregamento de página, uma vez por sessão, e elimina a corrida.
    setTimeout(() => setStalled(true), 8000)
    window.location.assign(redirectTo)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <Activity className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
            Boot Clinic CRM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse sua conta para continuar
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@clinica.com.br"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
                Senha
              </label>
              <input
                type="password"
                id="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {stalled && (
              <div className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
                Sua senha foi aceita, mas a tela está demorando para abrir.{' '}
                <a href={redirectTo} className="font-medium text-primary underline">
                  Clique aqui para entrar
                </a>
                .
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Boot Clinic CRM · Gestão de clínicas médicas
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Carregando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
