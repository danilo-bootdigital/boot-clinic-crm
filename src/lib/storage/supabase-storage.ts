import { createAdminClient } from '@/lib/supabase/admin';

// Armazenamento de anexos de pacientes no Supabase Storage (infra já existente).
// Bucket privado; leitura via signed URL. Usa a service role (somente servidor).

const BUCKET = 'patient-attachments';

export function isStorageConfigured() {
  return !!createAdminClient();
}

// Garante que o bucket existe (idempotente).
async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  if (!admin) return;
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  }
}

export interface UploadInput {
  companyId: string;
  patientId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

// Faz upload e devolve o caminho (path) armazenado no banco. O nome é "limpo"
// e prefixado por empresa/paciente para isolamento e organização.
export async function uploadAttachment(input: UploadInput): Promise<{ path: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error('Storage indisponível (configure SUPABASE_SERVICE_ROLE_KEY).');
  await ensureBucket(admin);

  const safe = input.fileName.replace(/[^\w.\-]+/g, '_').slice(-80);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${input.companyId}/${input.patientId}/${rand}-${safe}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return { path };
}

// Gera uma URL assinada temporária para download/visualização.
export async function signedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl || null;
}

export async function removeAttachment(path: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}
