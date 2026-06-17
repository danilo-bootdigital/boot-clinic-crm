import { createClient } from '@supabase/supabase-js';

// Cliente admin (service role) — SOMENTE no servidor. Retorna null se a chave
// não estiver configurada, para o handler responder de forma amigável.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
