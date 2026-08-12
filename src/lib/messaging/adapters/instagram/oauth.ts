// Helpers do OAuth do Instagram. Fora do arquivo de rota porque route.ts do Next
// só aceita exports reconhecidos por ele.
import { createHmac } from 'node:crypto';

export function callbackUrl(origin: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin;
  return `${base.replace(/\/$/, '')}/api/mensageria/accounts/instagram/callback`;
}

/**
 * `state` assinado: carrega a clínica e prova que o callback veio de um fluxo
 * que NÓS iniciamos. Sem isso, alguém induz um admin a abrir um callback
 * forjado e conecta o Instagram do atacante na clínica da vítima (CSRF).
 */
export function signState(companyId: string, userId: string): string {
  const secret = process.env.META_APP_SECRET || '';
  const payload = `${companyId}:${userId}:${Date.now()}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}
