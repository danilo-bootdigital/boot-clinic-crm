// Validação/formatos de mídia do LADO CLIENTE (browser-safe: sem node:crypto).
// É apenas UX — o servidor RE-VALIDA de forma autoritativa (magic-bytes, etc.).
// Espelha os limites/allowlist de media-config (mantidos em sincronia manualmente;
// o servidor é a fonte da verdade).

export type ClientMediaCategory = 'image' | 'document' | 'audio';

const MB = 1024 * 1024;
export const CLIENT_MEDIA_LIMITS: Record<ClientMediaCategory, number> = {
  image: 10 * MB,
  document: 20 * MB,
  audio: 16 * MB,
};

export const CLIENT_ALLOWED_MIME: Record<ClientMediaCategory, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  document: [
    'application/pdf', 'text/plain', 'text/csv', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'],
};

// Aceito no <input accept=...> (imagem + documento; áudio é pela gravação, não pelo seletor)
export const CLIENT_ACCEPT_ATTR = [...CLIENT_ALLOWED_MIME.image, ...CLIENT_ALLOWED_MIME.document].join(',');

// Remove parâmetros do MIME do browser (ex.: "audio/webm;codecs=opus").
function baseMime(mime: string): string {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

export function clientCategoryForMime(mime: string): ClientMediaCategory | null {
  const m = baseMime(mime);
  if (CLIENT_ALLOWED_MIME.image.includes(m)) return 'image';
  if (CLIENT_ALLOWED_MIME.audio.includes(m)) return 'audio';
  if (CLIENT_ALLOWED_MIME.document.includes(m)) return 'document';
  return null;
}

export interface ClientFileLike {
  type: string;
  name: string;
  size: number;
}

export interface ClientValidation {
  ok: boolean;
  error?: string;
  category?: ClientMediaCategory;
}

// Pré-validação de UX antes do upload (o servidor decide de fato).
export function clientValidateFile(file: ClientFileLike): ClientValidation {
  const category = clientCategoryForMime(file.type);
  if (!category) return { ok: false, error: 'Formato não suportado (use imagem ou documento).' };
  if (!file.size || file.size <= 0) return { ok: false, error: 'Arquivo vazio.' };
  const max = CLIENT_MEDIA_LIMITS[category];
  if (file.size > max) return { ok: false, error: `Arquivo excede ${Math.round(max / MB)} MB.` };
  return { ok: true, category };
}

export function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}
