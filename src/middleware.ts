import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Criar cliente Supabase para middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        },
      },
    }
  )

  // Obter sessão do usuário
  const { data: { user } } = await supabase.auth.getUser()

  // Verificar se é uma rota protegida
  const { pathname } = request.nextUrl
  // '/' precisa ser correspondência exata; o resto pode ser por prefixo.
  // (Antes '/' usava startsWith e tornava TODAS as rotas públicas.)
  const exactPublicPaths = ['/']
  const prefixPublicPaths = ['/login', '/api/auth', '/api/public']
  const isPublicPath =
    exactPublicPaths.includes(pathname) ||
    prefixPublicPaths.some(path => pathname.startsWith(path))

  if (!isPublicPath && !user) {
    // Chamadas de API não autenticadas devem receber 401 JSON, não um
    // redirect para a página de login (senão o fetch seguiria o redirect
    // e receberia HTML em vez de um erro tratável).
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    // Páginas protegidas: redireciona para o login.
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}