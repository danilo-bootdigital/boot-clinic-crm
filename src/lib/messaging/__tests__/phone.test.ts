import { describe, it, expect } from 'vitest';
import { looksLikePhone } from '@/lib/messaging/phone';

describe('looksLikePhone', () => {
  it('aceita celular e fixo brasileiros com código do país', () => {
    expect(looksLikePhone('5511987654321')).toBe(true); // 13: 55 + DDD + 9
    expect(looksLikePhone('551137654321')).toBe(true); // 12: 55 + DDD + 8
  });

  it('aceita internacional plausível', () => {
    expect(looksLikePhone('351912345678')).toBe(true); // Portugal
    expect(looksLikePhone('12125550123')).toBe(true); // EUA: 1 + 10
  });

  it('rejeita os @lid vistos em produção', () => {
    expect(looksLikePhone('103736563204138')).toBe(false); // 15
    expect(looksLikePhone('96366818799797')).toBe(false); // 14
    expect(looksLikePhone('214203054985432')).toBe(false); // 15
    // 13 dígitos começando com 1: NANP exige 11, então não é discável.
    expect(looksLikePhone('1744109080773')).toBe(false);
  });

  it('rejeita 55 com tamanho impossível', () => {
    expect(looksLikePhone('55119876543')).toBe(false); // 11: curto p/ BR
    expect(looksLikePhone('5511987654321000')).toBe(false); // longo demais
  });

  it('rejeita vazio, curto e não-numérico', () => {
    expect(looksLikePhone('')).toBe(false);
    expect(looksLikePhone(null)).toBe(false);
    expect(looksLikePhone('12345')).toBe(false);
    expect(looksLikePhone('abc')).toBe(false);
  });

  it('ignora formatação', () => {
    expect(looksLikePhone('+55 (11) 98765-4321')).toBe(true);
  });
});

import { dialableNumber } from '@/lib/messaging/phone';

describe('dialableNumber', () => {
  it('prefixa 55 no celular BR digitado só com DDD', () => {
    // O caso da clínica: salvo assim, o WhatsApp lia +1 193… e recusava (HTTP 400).
    expect(dialableNumber('11937092490')).toBe('5511937092490');
    expect(dialableNumber('11 93709-2490')).toBe('5511937092490');
    expect(dialableNumber('(21) 99998-3227')).toBe('5521999983227');
  });

  it('prefixa 55 no fixo BR digitado só com DDD', () => {
    expect(dialableNumber('1133334444')).toBe('551133334444');
  });

  it('é idempotente para número BR que já tem DDI', () => {
    expect(dialableNumber('5511937092490')).toBe('5511937092490');
    expect(dialableNumber('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(dialableNumber('551133334444')).toBe('551133334444');
  });

  it('não inventa DDI para número estrangeiro que já está completo', () => {
    // Contatos reais da base: EUA, Portugal, Itália, Reino Unido, Chile.
    expect(dialableNumber('13109134774')).toBe('13109134774');
    expect(dialableNumber('19786019327')).toBe('19786019327');
    expect(dialableNumber('351915089630')).toBe('351915089630');
    expect(dialableNumber('393445126177')).toBe('393445126177');
    expect(dialableNumber('447312148840')).toBe('447312148840');
    expect(dialableNumber('56973808664')).toBe('56973808664');
  });

  it('respeita o + como afirmação de internacional', () => {
    expect(dialableNumber('+1 305 555 0134')).toBe('13055550134');
  });

  it('recusa o que não tem forma de telefone', () => {
    expect(dialableNumber('')).toBeUndefined();
    expect(dialableNumber(null)).toBeUndefined();
    expect(dialableNumber('12345')).toBeUndefined();
    expect(dialableNumber('103736563204138')).toBeUndefined(); // @lid
  });
});

import { looksLikeGroupId } from '@/lib/messaging/phone';

describe('looksLikeGroupId', () => {
  it('reconhece grupo pelo domínio', () => {
    expect(looksLikeGroupId('120363427978679849@g.us')).toBe(true);
  });

  it('reconhece grupo pela FORMA quando o domínio não vem no payload', () => {
    // Foi assim que "NETWORKING TOP" virou contato da clínica.
    expect(looksLikeGroupId('120363427978679849')).toBe(true);
    expect(looksLikeGroupId('120363290775029388')).toBe(true);
  });

  it('não confunde telefone com grupo', () => {
    expect(looksLikeGroupId('5511987654321')).toBe(false);
    expect(looksLikeGroupId('351912345678')).toBe(false);
  });

  it('não confunde @lid de 14–15 dígitos com grupo', () => {
    // lid não é grupo: é pessoa com identidade opaca, e a thread dela vale.
    expect(looksLikeGroupId('103736563204138')).toBe(false);
    expect(looksLikeGroupId('96366818799797')).toBe(false);
  });

  it('vazio é falso', () => {
    expect(looksLikeGroupId('')).toBe(false);
    expect(looksLikeGroupId(null)).toBe(false);
  });
});
