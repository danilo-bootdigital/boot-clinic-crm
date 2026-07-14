import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do admin client (Supabase). Sem rede, sem service role real.
const storageApi = {
  getBucket: vi.fn(async () => ({ data: { name: 'whatsapp-media' } })),
  createBucket: vi.fn(async () => ({ data: {}, error: null })),
  upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/x' }, error: null })),
  remove: vi.fn(async () => ({ data: {}, error: null })),
};
const adminClient = { storage: { from: () => storageApi, getBucket: storageApi.getBucket, createBucket: storageApi.createBucket } };
let adminAvailable = true;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => (adminAvailable ? adminClient : null) }));

import {
  pathBelongsToCompany, createWhatsappMediaSignedUrl, deleteWhatsappMedia, uploadWhatsappMedia,
} from '@/lib/storage/whatsapp-storage';

const JPEG = (() => { const a = new Uint8Array(2048); a.set([0xff, 0xd8, 0xff, 0xe0]); return a; })();

beforeEach(() => {
  adminAvailable = true;
  vi.clearAllMocks();
});

describe('pathBelongsToCompany', () => {
  it('aceita path da própria empresa', () => {
    expect(pathBelongsToCompany('c1/conv/msg/uuid-a.jpg', 'c1')).toBe(true);
  });
  it('bloqueia path de outra empresa', () => {
    expect(pathBelongsToCompany('c2/conv/msg/uuid-a.jpg', 'c1')).toBe(false);
  });
  it('bloqueia traversal e path absoluto', () => {
    expect(pathBelongsToCompany('c1/../c2/x', 'c1')).toBe(false);
    expect(pathBelongsToCompany('/c1/x', 'c1')).toBe(false);
  });
  it('bloqueia prefixo parcial: "abc" não acessa paths de "abcd"', () => {
    expect(pathBelongsToCompany('abcd/conv/x.jpg', 'abc')).toBe(false);
    expect(pathBelongsToCompany('abc/conv/x.jpg', 'abc')).toBe(true);
  });
  it('bloqueia segmento vazio e backslash', () => {
    expect(pathBelongsToCompany('c1//x', 'c1')).toBe(false);
    expect(pathBelongsToCompany('c1\\x', 'c1')).toBe(false);
  });
});

describe('createWhatsappMediaSignedUrl — isolamento', () => {
  it('gera URL assinada para path da própria empresa', async () => {
    const url = await createWhatsappMediaSignedUrl('c1/conv/msg/uuid-a.jpg', 'c1');
    expect(url).toBe('https://signed.example/x');
    expect(storageApi.createSignedUrl).toHaveBeenCalledOnce();
  });
  it('BLOQUEIA URL assinada cross-company (nem chama o storage)', async () => {
    const url = await createWhatsappMediaSignedUrl('c2/conv/msg/uuid-a.jpg', 'c1');
    expect(url).toBeNull();
    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('deleteWhatsappMedia — isolamento', () => {
  it('remove da própria empresa', async () => {
    expect(await deleteWhatsappMedia('c1/a/b/x.jpg', 'c1')).toBe(true);
    expect(storageApi.remove).toHaveBeenCalledOnce();
  });
  it('bloqueia remoção cross-company', async () => {
    expect(await deleteWhatsappMedia('c2/a/b/x.jpg', 'c1')).toBe(false);
    expect(storageApi.remove).not.toHaveBeenCalled();
  });
});

describe('uploadWhatsappMedia', () => {
  it('faz upload de imagem válida com path isolado por empresa', async () => {
    const r = await uploadWhatsappMedia({
      companyId: 'c1', conversationId: 'conv1', messageId: 'msg1',
      fileName: 'foto.jpg', contentType: 'image/jpeg', bytes: JPEG,
    });
    // path = {companyId}/{conversationId}/{messageId}/{uuid}-{nomeSanitizado}
    expect(r.path).toMatch(/^c1\/conv1\/msg1\/[0-9a-f-]{36}-foto\.jpg$/);
    expect(r.checksum).toBeTruthy();
    expect(storageApi.upload).toHaveBeenCalledOnce();
  });
  it('rejeita mídia inválida ANTES de chamar o storage', async () => {
    await expect(uploadWhatsappMedia({
      companyId: 'c1', conversationId: 'conv1', messageId: 'msg1',
      fileName: 'x.svg', contentType: 'image/svg+xml', bytes: new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(/não permitido/i);
    expect(storageApi.upload).not.toHaveBeenCalled();
  });
});
