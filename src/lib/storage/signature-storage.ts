import { createAdminClient } from '@/lib/supabase/admin';

// Assinatura digitalizada do profissional. Bucket PRIVADO e dedicado.
//
// Por que separado do clinical-media: a assinatura de um médico é um artefato
// que, vazado, permite falsificar documento assinado. Bucket próprio deixa a
// política de acesso explícita e evita que ela seja lida por engano junto de
// anexo de paciente. Leitura só por signed URL de curta duração.

const BUCKET = 'professional-signatures';

// Assinatura é imagem: PNG/JPEG/WebP. Sem PDF de propósito — o caso de uso é
// estampar a imagem em documento, não anexar arquivo.
const MIMES_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_POR_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const TAMANHO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function isSignatureStorageConfigured() {
  return !!createAdminClient();
}

export function validateSignatureFile(input: { mimeType: string; sizeBytes: number }):
  | { ok: true; ext: string }
  | { ok: false; error: string } {
  const mime = input.mimeType.split(';')[0].trim().toLowerCase();
  if (!MIMES_PERMITIDOS.has(mime)) {
    return { ok: false, error: 'Envie a assinatura como imagem PNG, JPG ou WebP.' };
  }
  if (input.sizeBytes <= 0) return { ok: false, error: 'Arquivo vazio.' };
  if (input.sizeBytes > TAMANHO_MAX_BYTES) {
    return { ok: false, error: 'A imagem deve ter até 2 MB.' };
  }
  return { ok: true, ext: EXT_POR_MIME[mime] };
}

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  if (!admin) return;
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
}

export async function uploadSignature(input: {
  companyId: string;
  professionalId: string;
  ext: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<{ path: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error('Storage indisponível (configure SUPABASE_SERVICE_ROLE_KEY).');
  await ensureBucket(admin);

  // Nome do arquivo NUNCA vem do cliente: é derivado. Elimina path traversal e
  // vazamento do nome original do arquivo do médico.
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${input.companyId}/${input.professionalId}/assinatura-${rand}.${input.ext}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return { path };
}

/** URL assinada curta — a assinatura não deve ficar acessível por link durável. */
export async function signatureSignedUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl || null;
}

export async function removeSignature(path: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}
