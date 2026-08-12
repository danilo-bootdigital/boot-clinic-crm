// `@lid` é o identificador de privacidade do WhatsApp — parece um número gigante
// mas NÃO é telefone. Guardá-lo no campo de telefone sujava o cadastro e, pior,
// o casamento de contato por sufixo de telefone poderia unir duas pessoas.
import { describe, it, expect } from 'vitest';
import { jidToExternalId, jidToPhone } from '@/lib/messaging/adapters/whatsapp/classify';

describe('jid → identidade e telefone', () => {
  it('jid normal: identidade e telefone são o mesmo número', () => {
    expect(jidToExternalId('5511999998888@s.whatsapp.net')).toBe('5511999998888');
    expect(jidToPhone('5511999998888@s.whatsapp.net')).toBe('5511999998888');
  });

  it('ignora o sufixo de device', () => {
    expect(jidToExternalId('5511999998888:12@s.whatsapp.net')).toBe('5511999998888');
    expect(jidToPhone('5511999998888:12@s.whatsapp.net')).toBe('5511999998888');
  });

  it('@lid tem identidade mas NÃO tem telefone', () => {
    // Foi o caso real visto em produção: 103736563204138 aparecia como telefone.
    expect(jidToExternalId('103736563204138@lid')).toBe('103736563204138');
    expect(jidToPhone('103736563204138@lid')).toBeUndefined();
  });

  it('domínio legado c.us continua valendo como telefone', () => {
    expect(jidToPhone('5511999998888@c.us')).toBe('5511999998888');
  });

  it('grupo tem identidade mas não telefone', () => {
    expect(jidToExternalId('123456-789@g.us')).toBe('123456-789');
    expect(jidToPhone('123456-789@g.us')).toBeUndefined();
  });

  it('vazio/nulo devolve undefined nos dois', () => {
    for (const v of [null, undefined, '']) {
      expect(jidToExternalId(v as never)).toBeUndefined();
      expect(jidToPhone(v as never)).toBeUndefined();
    }
  });
});
