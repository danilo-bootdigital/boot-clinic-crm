// Palavra-chave da mensagem pronta ("/palavra" no composer): só [a-z0-9_-],
// é o que dá para digitar sem espaço depois do "/". Aceita colar o "/" também
// (ex.: usuário copiou "/saudacao" de outro lugar).
export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/^\/+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
