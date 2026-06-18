import { createAdminClient } from '@/lib/supabase/admin';

// Armazenamento de mídia clínica (imagens, documentos, anexos de prontuário e
// uploads de anamnese) no Supabase Storage. Bucket privado; leitura via signed
// URL. Usa a service role (somente servidor). Espelha lib/storage/supabase-storage
// (anexos de paciente) mas num bucket dedicado a dado clínico.

const BUCKET = 'clinical-media';

export function isClinicalStorageConfigured() {
  return !!createAdminClient();
}

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  if (!admin) return;
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  }
}

export interface ClinicalUploadInput {
  companyId: string;
  patientId: string;
  kind: 'images' | 'documents' | 'records' | 'anamnesis'; // pasta lógica
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

// Faz upload e devolve o path armazenado no banco. Isolado por empresa/paciente.
export async function uploadClinicalFile(input: ClinicalUploadInput): Promise<{ path: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error('Storage indisponível (configure SUPABASE_SERVICE_ROLE_KEY).');
  await ensureBucket(admin);

  const safe = input.fileName.replace(/[^\w.\-]+/g, '_').slice(-80);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${input.companyId}/${input.patientId}/${input.kind}/${rand}-${safe}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return { path };
}

// URL assinada temporária para download/visualização.
export async function clinicalSignedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return data?.signedUrl || null;
}

export async function removeClinicalFile(path: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}
