// Tradução do payload do Instagram para o vocabulário do núcleo.
import { describe, it, expect } from 'vitest';
import { parseInstagramWebhook } from '@/lib/messaging/adapters/instagram/classify';

function envelope(messaging: any) {
  return { object: 'instagram', entry: [{ id: 'page1', messaging: [messaging] }] };
}

describe('parseInstagramWebhook', () => {
  it('extrai texto, remetente, destinatário e id externo', () => {
    const [m] = parseInstagramWebhook(
      envelope({
        sender: { id: 'igsid-cliente' },
        recipient: { id: 'igsid-clinica' },
        timestamp: 1700000000000,
        message: { mid: 'mid.abc', text: 'quero marcar' },
      })
    );
    expect(m.senderId).toBe('igsid-cliente');
    expect(m.recipientId).toBe('igsid-clinica');
    expect(m.externalId).toBe('mid.abc');
    expect(m.text).toBe('quero marcar');
    expect(m.kind).toBe('TEXT');
    expect(m.entryPoint).toBe('DIRECT');
  });

  it('classifica anexos por tipo', () => {
    const kinds = ['image', 'audio', 'video', 'file'].map((type) => {
      const [m] = parseInstagramWebhook(
        envelope({
          sender: { id: 's' },
          recipient: { id: 'r' },
          message: { mid: `mid-${type}`, attachments: [{ type }] },
        })
      );
      return m.kind;
    });
    expect(kinds).toEqual(['IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT']);
  });

  it('marca anúncio como entryPoint AD e guarda o referral sanitizado', () => {
    const [m] = parseInstagramWebhook(
      envelope({
        sender: { id: 's' },
        recipient: { id: 'r' },
        message: { mid: 'mid1', text: 'vi o anúncio' },
        referral: { source: 'ADS', type: 'OPEN_THREAD', ad_id: '999', ref: 'campanha-verao' },
      })
    );
    expect(m.entryPoint).toBe('AD');
    expect(m.referral).toEqual({ source: 'ADS', type: 'OPEN_THREAD', adId: '999', refCode: 'campanha-verao' });
  });

  it('reconhece resposta a story', () => {
    const [m] = parseInstagramWebhook(
      envelope({
        sender: { id: 's' },
        recipient: { id: 'r' },
        message: { mid: 'mid2', attachments: [{ type: 'story_mention' }] },
      })
    );
    expect(m.entryPoint).toBe('STORY_REPLY');
  });

  it('sinaliza eco da própria mensagem (a Meta reentrega o que a Página enviou)', () => {
    const [m] = parseInstagramWebhook(
      envelope({
        sender: { id: 'igsid-clinica' },
        recipient: { id: 'igsid-cliente' },
        message: { mid: 'mid3', text: 'oi', is_echo: true },
      })
    );
    expect(m.isEcho).toBe(true);
  });

  it('ignora evento sem conteúdo utilizável (read, reação, apagada)', () => {
    expect(parseInstagramWebhook(envelope({ sender: { id: 's' }, recipient: { id: 'r' }, read: { watermark: 1 } }))).toEqual([]);
    expect(
      parseInstagramWebhook(
        envelope({ sender: { id: 's' }, recipient: { id: 'r' }, reaction: { emoji: '❤' }, message: { mid: 'x', text: 'oi' } })
      )
    ).toEqual([]);
    expect(
      parseInstagramWebhook(envelope({ sender: { id: 's' }, recipient: { id: 'r' }, message: { mid: 'y', is_deleted: true } }))
    ).toEqual([]);
  });

  it('descarta evento sem remetente ou destinatário', () => {
    expect(parseInstagramWebhook(envelope({ message: { mid: 'z', text: 'oi' } }))).toEqual([]);
  });
});
