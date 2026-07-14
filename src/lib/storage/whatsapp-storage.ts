import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateWhatsappMedia, type MediaValidationResult } from '@/lib/whatsapp/media-config';

// Armazenamento PRIVADO de mídia do WhatsApp no Supabase Storage. Espelha o padrão de
// lib/storage/clinical-storage (bucket privado + signed URL + service role só no
// servidor), mas em bucket dedicado e com isolamento por companyId embutido NO PATH.
// A service role NUNCA vai ao frontend — o cliente só recebe signed URLs de curta duração.

const BUCKET = 'whatsapp-media';
const SIGNED_URL_TTL_SECONDS = 300; // 5 min — curto por padrão

export function isWhatsappStorageConfigured() {
  return !!createAdminClient();
}

async function ensureBucket(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin.storage.getBucket(BUCKET);
  if (data) return; // já existe
  // Diferencia "bucket inexistente" de erro de permissão/rede: só cria no 1º caso.
  const msg = (error?.message || '').toLowerCase();
  const notFound = !error || msg.includes('not found') || msg.includes('does not exist') || (error as any)?.status === 404;
  if (!notFound) throw new Error(`Storage indisponível: ${error?.message || 'erro ao consultar bucket'}`);
  const { error: createErr } = await admin.storage.createBucket(BUCKET, { public: false });
  // Corrida: outro request criou primeiro → "already exists" é ok.
  if (createErr && !/already exists/i.test(createErr.message || '')) {
    throw new Error(`Falha ao criar bucket privado: ${createErr.message}`);
  }
}

// Um path pertence à empresa quando o PRIMEIRO segmento é exatamente o companyId.
// Valida por segmentos (não só startsWith): bloqueia traversal, path absoluto,
// segmentos vazios e o caso "abc" vs "abcd".
export function pathBelongsToCompany(path: string, companyId: string): boolean {
  if (!companyId || !path) return false;
  if (path.startsWith('/') || path.includes('\0') || path.includes('\\')) return false;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false;
  return segments[0] === companyId;
}

export interface WhatsappUploadInput {
  companyId: string;
  conversationId: string;
  messageId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface WhatsappUploadResult {
  path: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  originalFileName: string;
}

// Valida (MIME/extensão/tamanho/nome/traversal/checksum) e faz upload. O path é
// {companyId}/{conversationId}/{messageId}/{uuid}-{nomeSanitizado} — o nome original
// NUNCA compõe o path (só é guardado para exibição).
export async function uploadWhatsappMedia(input: WhatsappUploadInput): Promise<WhatsappUploadResult> {
  const check: MediaValidationResult = validateWhatsappMedia({
    declaredMime: input.contentType,
    fileName: input.fileName,
    sizeBytes: input.bytes.length,
    bytes: input.bytes,
  });
  if (!check.ok) throw new Error(check.error || 'Mídia inválida');

  const admin = createAdminClient();
  if (!admin) throw new Error('Storage indisponível (configure SUPABASE_SERVICE_ROLE_KEY).');
  await ensureBucket(admin);

  const path = `${input.companyId}/${input.conversationId}/${input.messageId}/${randomUUID()}-${check.sanitizedFileName}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);

  return {
    path,
    mimeType: input.contentType,
    sizeBytes: input.bytes.length,
    checksum: check.checksum,
    originalFileName: check.sanitizedFileName!,
  };
}

// URL assinada de curta duração — SOMENTE se o path pertence à empresa do chamador.
// Retorna null quando cross-company (bloqueio) ou storage indisponível.
export async function createWhatsappMediaSignedUrl(
  path: string,
  companyId: string,
  expiresInSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!pathBelongsToCompany(path, companyId)) return null; // isolamento multiempresa
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl || null;
}

// Lê os bytes da mídia — SOMENTE se o path pertence à empresa do chamador.
// Usado para reenvio (retry) sem re-upload. Retorna null se cross-company/indisponível.
export async function downloadWhatsappMediaBytes(path: string, companyId: string): Promise<Uint8Array | null> {
  if (!pathBelongsToCompany(path, companyId)) return null; // isolamento multiempresa
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// Remove a mídia — SOMENTE se o path pertence à empresa do chamador.
export async function deleteWhatsappMedia(path: string, companyId: string): Promise<boolean> {
  if (!pathBelongsToCompany(path, companyId)) return false; // isolamento multiempresa
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  return !error;
}

export { validateWhatsappMedia };
