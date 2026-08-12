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
