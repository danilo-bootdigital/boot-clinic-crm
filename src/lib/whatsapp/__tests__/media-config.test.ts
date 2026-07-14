import { describe, it, expect } from 'vitest';
import {
  validateWhatsappMedia, categoryForMime, maxBytesForMime, sanitizeFileName,
  hasPathTraversal, sniffMime, sha256, MEDIA_LIMITS,
} from '@/lib/whatsapp/media-config';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

function pad(base: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  out.set(base.slice(0, size));
  return out;
}

describe('media-config: categorização e limites', () => {
  it('mapeia MIME para categoria', () => {
    expect(categoryForMime('image/jpeg')).toBe('image');
    expect(categoryForMime('audio/ogg')).toBe('audio');
    expect(categoryForMime('application/pdf')).toBe('document');
    expect(categoryForMime('image/svg+xml')).toBeNull();
  });
  it('limite por MIME', () => {
    expect(maxBytesForMime('image/png')).toBe(MEDIA_LIMITS.image);
    expect(maxBytesForMime('application/octet-stream')).toBeNull();
  });
});

describe('media-config: sanitização e traversal', () => {
  it('remove diretórios e caracteres perigosos', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('foto legal!.jpg')).toBe('foto_legal_.jpg');
  });
  it('detecta path traversal', () => {
    expect(hasPathTraversal('../x')).toBe(true);
    expect(hasPathTraversal('a/b')).toBe(true);
    expect(hasPathTraversal('foto.jpg')).toBe(false);
  });
});

describe('media-config: sniff e checksum', () => {
  it('detecta magic bytes conhecidos', () => {
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('sha256 é determinístico', () => {
    expect(sha256(JPEG)).toBe(sha256(JPEG));
    expect(sha256(JPEG)).not.toBe(sha256(PNG));
  });
});

describe('validateWhatsappMedia', () => {
  it('aceita imagem válida com checksum', () => {
    const bytes = pad(JPEG, 1024);
    const r = validateWhatsappMedia({ declaredMime: 'image/jpeg', fileName: 'foto.jpg', sizeBytes: 1024, bytes });
    expect(r.ok).toBe(true);
    expect(r.category).toBe('image');
    expect(r.sanitizedFileName).toBe('foto.jpg');
    expect(r.checksum).toBeTruthy();
  });
  it('rejeita MIME não permitido (SVG)', () => {
    const r = validateWhatsappMedia({ declaredMime: 'image/svg+xml', fileName: 'x.svg', sizeBytes: 10 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não permitido/i);
  });
  it('rejeita por tamanho acima do limite', () => {
    const r = validateWhatsappMedia({ declaredMime: 'image/jpeg', fileName: 'g.jpg', sizeBytes: MEDIA_LIMITS.image + 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limite/i);
  });
  it('rejeita extensão incompatível com o MIME', () => {
    const r = validateWhatsappMedia({ declaredMime: 'image/png', fileName: 'x.jpg', sizeBytes: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/extens/i);
  });
  it('rejeita nome com path traversal', () => {
    const r = validateWhatsappMedia({ declaredMime: 'application/pdf', fileName: '../../secret.pdf', sizeBytes: 100 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/inválido/i);
  });
  it('rejeita spoof: conteúdo não corresponde ao MIME declarado', () => {
    const bytes = pad(PDF, 512); // conteúdo é PDF
    const r = validateWhatsappMedia({ declaredMime: 'image/png', fileName: 'fake.png', sizeBytes: 512, bytes });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/não corresponde/i);
  });
  it('rejeita quando tamanho declarado difere do conteúdo', () => {
    const bytes = pad(JPEG, 100);
    const r = validateWhatsappMedia({ declaredMime: 'image/jpeg', fileName: 'a.jpg', sizeBytes: 999, bytes });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/difere/i);
  });
});
