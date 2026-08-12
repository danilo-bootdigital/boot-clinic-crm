// Verificação do webhook da Meta — as duas metades que o WhatsApp/Evolution não tem.
//
// 1. HANDSHAKE (GET): ao salvar a URL no painel da Meta, ela chama com
//    hub.mode=subscribe & hub.verify_token & hub.challenge. Precisamos devolver
//    o challenge CRU quando o token bate. Sem isso a Meta não assina o webhook.
//
// 2. ASSINATURA (POST): cada entrega vem com X-Hub-Signature-256 =
//    sha256=<HMAC do CORPO CRU com o App Secret>. É o que autentica a origem —
//    o endpoint é público, então sem essa checagem qualquer um injeta mensagem
//    na mensageria de qualquer clínica.
//
// Comparação em tempo constante nas duas.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual exige mesmo tamanho; compara hashes p/ não vazar comprimento.
  const ha = createHmac('sha256', 'len').update(ba).digest();
  const hb = createHmac('sha256', 'len').update(bb).digest();
  try {
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

export interface HubChallenge {
  mode?: string | null;
  verifyToken?: string | null;
  challenge?: string | null;
}

/**
 * Resultado do handshake. `challenge` só volta quando o token confere — devolver
 * o challenge sem checar o token deixaria qualquer um assinar nosso webhook.
 */
export function resolveHubChallenge(input: HubChallenge): { ok: boolean; challenge?: string } {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) return { ok: false };
  if (input.mode !== 'subscribe') return { ok: false };
  if (!input.verifyToken || !constantTimeEquals(input.verifyToken, expected)) return { ok: false };
  if (!input.challenge) return { ok: false };
  return { ok: true, challenge: input.challenge };
}

/**
 * Valida X-Hub-Signature-256 contra o corpo CRU.
 *
 * `rawBody` tem que ser exatamente o texto recebido: reserializar o JSON muda
 * bytes (ordem de chaves, espaços) e a assinatura passa a nunca bater.
 */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const [algo, received] = header.split('=');
  if (algo !== 'sha256' || !received) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return constantTimeEquals(received, expected);
}
