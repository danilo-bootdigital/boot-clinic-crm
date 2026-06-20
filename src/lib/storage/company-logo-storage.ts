import { createAdminClient } from '@/lib/supabase/admin';

// Armazenamento do logotipo da clínica (identidade visual) no Supabase Storage.
// Diferente dos anexos de paciente, o logo NÃO é sensível e precisa de URL estável
// para renderizar direto no <img> da sidebar — por isso usamos um bucket PÚBLICO.
// Usa a service role (somente servidor). Isolamento por empresa via prefixo do path.

const BUCKET = 'company-logos';

export function isStorageConfigured() {
  return !!createAdminClient();
}

// Garante que o bucket público existe (idempotente).
async function ensureBucket(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage
      .createBucket(BUCKET, { public: true, fileSizeLimit: 2 * 1024 * 1024 })
      .catch(() => {});
  }
}

export interface UploadLogoInput {
  companyId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

// Faz upload e devolve a URL pública (a ser persistida em Company.logo). O path é
// prefixado pela empresa para isolamento; o nome aleatório evita cache obsoleto na CDN.
export async function uploadCompanyLogo(input: UploadLogoInput): Promise<{ url: string }> {
  const admin = createAdminClient();
  if (!admin) throw new Error('Storage indisponível (configure SUPABASE_SERVICE_ROLE_KEY).');
  await ensureBucket(admin);

  const safe = input.fileName.replace(/[^\w.\-]+/g, '_').slice(-60);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${input.companyId}/${rand}-${safe}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

// Remove o arquivo de logo a partir da URL pública previamente salva. Best-effort:
// só apaga se a URL pertencer a este bucket E ao prefixo da empresa (defesa extra).
export async function removeCompanyLogoByUrl(url: string | null | undefined, companyId: string): Promise<void> {
  if (!url) return;
  const admin = createAdminClient();
  if (!admin) return;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  if (!path || !path.startsWith(`${companyId}/`)) return;
  await admin.storage.from(BUCKET).remove([path]).catch(() => {});
}
