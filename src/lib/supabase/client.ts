import { createBrowserClient } from '@supabase/ssr'

// Cliente Supabase para uso no browser (componentes client).
// A sessão é persistida em cookies pelo @supabase/ssr, o que permite
// que o middleware e os route handlers leiam o usuário autenticado.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
