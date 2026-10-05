import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Primitivas da assinatura eletrônica de contrato.
//
// Token do link e código do WhatsApp são guardados SÓ como hash: quem tiver
// leitura do banco (ou de um backup) não consegue montar o link nem assinar.

export const SIGN_LINK_TTL_DAYS = 7;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 5;
export const OTP_RESEND_SECONDS = 60;

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Token opaco do link público (256 bits). Volta o valor em claro e o hash a gravar. */
export function newSignToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

export function hashSignToken(token: string): string {
  return sha256Hex(token);
}

/** Código de 6 dígitos. O hash leva o id do contrato como sal — o mesmo código em
 *  dois contratos não gera o mesmo hash. */
export function newOtp(contractId: string): { code: string; hash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, hash: hashOtp(contractId, code) };
}

export function hashOtp(contractId: string, code: string): string {
  return sha256Hex(`${contractId}:${code.replace(/\D/g, '')}`);
}

export function otpMatches(contractId: string, code: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashOtp(contractId, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "(11) 9••••-4321" — mostra ao paciente para onde o código foi, sem expor o número. */
export function maskPhone(raw?: string | null): string {
  const d = (raw || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length < 8) return '••••';
  return `(${d.slice(0, 2)}) ${d[2]}••••-${d.slice(-4)}`;
}

export const onlyDigits = (v?: string | null) => (v || '').replace(/\D/g, '');

/** Primeiro IP do X-Forwarded-For (o cliente real atrás do proxy da Vercel). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') || 'desconhecido';
}

/** O texto assinado é exatamente este — o hash entra no PDF como prova de integridade. */
export function contractContentHash(title: string, content: string): string {
  return sha256Hex(`${title}\n\n${content}`);
}

/** Aceita data URL PNG do quadro de assinatura e devolve os bytes, ou null se inválido. */
export function decodeSignaturePng(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const bytes = Buffer.from(m[1], 'base64');
  // Assinatura real tem alguns KB; acima de 1 MB não é traço de dedo.
  if (bytes.length < 100 || bytes.length > 1024 * 1024) return null;
  // Magic bytes do PNG — não confiar só no prefixo da data URL.
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  return new Uint8Array(bytes);
}

// Domínio sempre do env (regra do projeto: nada hardcoded); a origem da
// requisição só cobre ambiente local/preview sem a variável.
export function signLinkUrl(token: string, origin: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');
  return `${base}/assinar/${token}`;
}
