// Configuração e validação de mídia do WhatsApp — PURA (sem Supabase/rede), por isso
// facilmente testável. Centraliza allowlist de MIME, limites de tamanho, sanitização
// de nome, bloqueio de path traversal e checksum. NENHUM número mágico espalhado.
//
// Allowlist estrita: qualquer coisa fora daqui é rejeitada (executável/script/HTML/
// SVG/zip/desconhecido caem por não estarem listados).

import { createHash } from 'node:crypto';

export type MediaCategory = 'image' | 'audio' | 'document';

const MB = 1024 * 1024;

// Limites por categoria (centralizados — mude AQUI).
export const MEDIA_LIMITS: Record<MediaCategory, number> = {
  image: 10 * MB,
  audio: 16 * MB,
  document: 20 * MB,
};

// MIME permitido por categoria + extensões aceitas para cada MIME.
export const ALLOWED_MEDIA: Record<MediaCategory, Record<string, string[]>> = {
  image: {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
  },
  audio: {
    'audio/mpeg': ['mp3'],
    'audio/mp4': ['m4a', 'mp4'],
    'audio/ogg': ['ogg', 'oga'],
    'audio/wav': ['wav'],
    'audio/webm': ['webm'],
  },
  document: {
    'application/pdf': ['pdf'],
    'text/plain': ['txt'],
    'text/csv': ['csv'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  },
};

export function categoryForMime(mime: string): MediaCategory | null {
  for (const cat of Object.keys(ALLOWED_MEDIA) as MediaCategory[]) {
    if (mime in ALLOWED_MEDIA[cat]) return cat;
  }
  return null;
}

export function maxBytesForMime(mime: string): number | null {
  const cat = categoryForMime(mime);
  return cat ? MEDIA_LIMITS[cat] : null;
}

// Extensão canônica p/ um MIME permitido (1ª da lista). Usada para nomear mídia
// recebida quando o provedor não envia fileName. null se MIME não permitido.
export function extensionForMime(mime: string): string | null {
  const cat = categoryForMime(mime);
  if (!cat) return null;
  return ALLOWED_MEDIA[cat][mime]?.[0] ?? null;
}

// Nome de arquivo padrão p/ mídia recebida sem nome (ex.: "midia.jpg").
export function defaultFileNameForMime(mime: string): string | null {
  const ext = extensionForMime(mime);
  return ext ? `midia.${ext}` : null;
}

// Sanitiza o nome para EXIBIÇÃO. Nunca é usado para montar o path (o path usa UUID).
// Remove diretórios, mantém [\w.-], colapsa e limita o tamanho.
export function sanitizeFileName(name: string): string {
  const base = String(name).replace(/\\/g, '/').split('/').pop() || 'arquivo';
  const cleaned = base.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (cleaned || 'arquivo').slice(-80);
}

// Detecta tentativa de path traversal / separadores em nomes.
export function hasPathTraversal(name: string): boolean {
  return /\.\.|[\/\\]|\0/.test(String(name));
}

// Tipos "container" que a assinatura sozinha NÃO desambigua:
//  - ZIP (PK\x03\x04): docx/xlsx (e muitos outros) compartilham a mesma assinatura;
//  - OLE (D0CF11E0): doc/xls legados compartilham a mesma assinatura.
// Por isso o sniff retorna o container e a validação decide a compatibilidade.
export const CONTAINER_ZIP = 'application/zip';
export const CONTAINER_OLE = 'application/x-ole-storage';

// Sniff de magic-bytes (defesa em profundidade; sem dependência externa). Retorna o
// MIME/container real detectado, ou null quando indeterminado (ex.: text/plain, csv).
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  const ascii = (i: number, s: string) => s.split('').every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (b.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (b.length >= 12 && ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'audio/wav';
  if (b.length >= 4 && ascii(0, '%PDF')) return 'application/pdf';
  if (b.length >= 4 && ascii(0, 'OggS')) return 'audio/ogg';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) return CONTAINER_ZIP;
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return CONTAINER_OLE;
  return null; // indeterminado (ex.: text/plain, text/csv) — ver limitação em contentMatchesDeclared
}

// Decide se o conteúdo detectado é compatível com o MIME declarado.
// Honesto sobre limites: text/plain e text/csv NÃO têm assinatura → não dá para
// verificar por bytes (retorna true; a defesa fica no MIME+extensão+tamanho e no
// ponto de extensão de antivírus). Isso EVITA falsa sensação de segurança.
export function contentMatchesDeclared(detected: string | null, declared: string): boolean {
  if (!detected) return true; // indeterminado (csv/txt) — não rejeita por bytes
  if (detected === CONTAINER_ZIP) {
    // Office moderno (docx/xlsx) é ZIP. Aceita só se o declarado é um desses.
    return declared === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || declared === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (detected === CONTAINER_OLE) {
    // Office legado (doc/xls) é OLE.
    return declared === 'application/msword' || declared === 'application/vnd.ms-excel';
  }
  // Tipos concretos (jpeg/png/webp/pdf/ogg/wav): exige correspondência exata
  // (pega spoof até dentro da mesma categoria, ex.: png declarado com bytes jpeg).
  return detected === declared;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface MediaValidationInput {
  declaredMime: string;
  fileName: string;
  sizeBytes: number;
  bytes?: Uint8Array; // opcional: habilita sniff real + checksum
}

export interface MediaValidationResult {
  ok: boolean;
  error?: string;
  category?: MediaCategory;
  sanitizedFileName?: string;
  checksum?: string;
  detectedMime?: string | null;
}

// Valida MIME declarado (allowlist) + extensão + tamanho + nome + (quando há bytes)
// MIME real por magic-bytes. Retorna motivo de rejeição sem vazar conteúdo.
export function validateWhatsappMedia(input: MediaValidationInput): MediaValidationResult {
  const { declaredMime, fileName, sizeBytes, bytes } = input;

  const category = categoryForMime(declaredMime);
  if (!category) return { ok: false, error: `MIME não permitido: ${declaredMime}` };

  if (hasPathTraversal(fileName)) return { ok: false, error: 'Nome de arquivo inválido' };
  const sanitizedFileName = sanitizeFileName(fileName);

  const ext = sanitizedFileName.includes('.') ? sanitizedFileName.split('.').pop()!.toLowerCase() : '';
  const allowedExts = ALLOWED_MEDIA[category][declaredMime];
  if (!ext || !allowedExts.includes(ext)) {
    return { ok: false, error: `Extensão incompatível com o tipo (${declaredMime})` };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: 'Tamanho inválido' };
  const max = MEDIA_LIMITS[category];
  if (sizeBytes > max) return { ok: false, error: `Arquivo excede o limite de ${Math.round(max / MB)} MB` };

  let detectedMime: string | null | undefined;
  let checksum: string | undefined;
  if (bytes) {
    if (bytes.length !== sizeBytes) return { ok: false, error: 'Tamanho declarado difere do conteúdo' };
    detectedMime = sniffMime(bytes);
    // Anti-spoof: quando dá para verificar por bytes, o conteúdo tem que ser
    // compatível com o MIME declarado (containers Office tratados à parte).
    if (!contentMatchesDeclared(detectedMime, declaredMime)) {
      return { ok: false, error: 'Conteúdo do arquivo não corresponde ao tipo declarado' };
    }
    checksum = sha256(bytes);
  }

  return { ok: true, category, sanitizedFileName, checksum, detectedMime };
}
