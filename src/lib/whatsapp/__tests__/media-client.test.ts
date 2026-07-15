import { describe, it, expect } from 'vitest';
import { clientValidateFile, formatBytes, clientCategoryForMime, CLIENT_MEDIA_LIMITS, CLIENT_ACCEPT_ATTR } from '@/lib/whatsapp/media-client';

describe('media-client: validação de UX', () => {
  it('aceita imagem válida', () => {
    const r = clientValidateFile({ type: 'image/png', name: 'a.png', size: 1000 });
    expect(r.ok).toBe(true);
    expect(r.category).toBe('image');
  });
  it('aceita documento válido', () => {
    const r = clientValidateFile({ type: 'application/pdf', name: 'a.pdf', size: 1000 });
    expect(r.ok).toBe(true);
    expect(r.category).toBe('document');
  });
  it('rejeita formato não suportado', () => {
    const r = clientValidateFile({ type: 'image/svg+xml', name: 'a.svg', size: 100 });
    expect(r.ok).toBe(false);
  });
  it('rejeita arquivo vazio', () => {
    const r = clientValidateFile({ type: 'image/png', name: 'a.png', size: 0 });
    expect(r.ok).toBe(false);
  });
  it('rejeita imagem acima do limite', () => {
    const r = clientValidateFile({ type: 'image/jpeg', name: 'g.jpg', size: CLIENT_MEDIA_LIMITS.image + 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/MB/);
  });
  it('categoria por MIME (áudio agora suportado, com ;codecs)', () => {
    expect(clientCategoryForMime('image/webp')).toBe('image');
    expect(clientCategoryForMime('text/csv')).toBe('document');
    expect(clientCategoryForMime('audio/ogg')).toBe('audio');
    expect(clientCategoryForMime('audio/webm;codecs=opus')).toBe('audio');
    expect(clientCategoryForMime('video/mp4')).toBeNull();
  });
  it('aceita áudio dentro do limite e rejeita acima', () => {
    expect(clientValidateFile({ type: 'audio/webm', name: 'nota.webm', size: 1000 }).ok).toBe(true);
    expect(clientValidateFile({ type: 'audio/ogg', name: 'g.ogg', size: CLIENT_MEDIA_LIMITS.audio + 1 }).ok).toBe(false);
  });
});

describe('media-client: formato e accept', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
  it('accept inclui image e pdf, não inclui áudio', () => {
    expect(CLIENT_ACCEPT_ATTR).toContain('image/jpeg');
    expect(CLIENT_ACCEPT_ATTR).toContain('application/pdf');
    expect(CLIENT_ACCEPT_ATTR).not.toContain('audio/');
  });
});
