import { describe, it, expect } from 'vitest';
import { extractMediaMeta } from '@/lib/messaging/adapters/whatsapp/classify';

// A duração declarada pelo WhatsApp é a única confiável para nota de voz: o
// container Ogg/Opus gravado em fluxo chega sem duração utilizável, e o player
// que confia no navegador corta o áudio antes do fim.
describe('extractMediaMeta', () => {
  it('áudio: extrai duração em segundos', () => {
    expect(extractMediaMeta({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 37 } }))
      .toMatchObject({ durationSeconds: 37 });
  });

  it('aceita número serializado como string', () => {
    expect(extractMediaMeta({ audioMessage: { seconds: '12', fileLength: '90210' } }))
      .toMatchObject({ durationSeconds: 12, declaredBytes: 90210 });
  });

  it('aceita Long do Baileys ({low, high})', () => {
    expect(extractMediaMeta({ audioMessage: { seconds: { low: 8, high: 0, unsigned: true }, fileLength: { low: 1500, high: 0 } } }))
      .toMatchObject({ durationSeconds: 8, declaredBytes: 1500 });
  });

  it('imagem: extrai dimensões e tamanho declarado', () => {
    expect(extractMediaMeta({ imageMessage: { width: 1080, height: 1920, fileLength: 240000 } }))
      .toMatchObject({ width: 1080, height: 1920, declaredBytes: 240000 });
  });

  it('documento com legenda: lê o nó aninhado', () => {
    expect(extractMediaMeta({ documentWithCaptionMessage: { message: { documentMessage: { fileLength: 4096 } } } }))
      .toMatchObject({ declaredBytes: 4096 });
  });

  it('sha256 só é aproveitado quando vem como base64 (string)', () => {
    expect(extractMediaMeta({ audioMessage: { fileSha256: 'YWJj' } }).sha256Base64).toBe('YWJj');
    expect(extractMediaMeta({ audioMessage: { fileSha256: { 0: 1, 1: 2 } } }).sha256Base64).toBeUndefined();
  });

  it('valores ausentes, zerados ou não numéricos não viram 0', () => {
    expect(extractMediaMeta({ audioMessage: { seconds: 0, fileLength: null, width: 'x' } }))
      .toEqual({ durationSeconds: undefined, width: undefined, height: undefined, declaredBytes: undefined, sha256Base64: undefined });
  });

  it('mensagem sem mídia devolve objeto vazio', () => {
    expect(extractMediaMeta({ conversation: 'oi' })).toEqual({});
    expect(extractMediaMeta(null)).toEqual({});
  });
});
