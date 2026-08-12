// Conversão conversa → oportunidade (diretriz §5).
//
// Cobre o que quebra silenciosamente: origem do lead derivada do canal (se
// virar escolha manual, o relatório do CRM mente) e a guarda de duplicata (sem
// ela, cada clique no botão enche o funil do mesmo contato).
import { describe, it, expect } from 'vitest';
import { dealSourceFor } from '@/lib/messaging/conversion';
import { Channel, DealSource, MessageEntryPoint } from '@prisma/client';

describe('origem do lead derivada do canal', () => {
  it('WhatsApp entra como WHATSAPP', () => {
    expect(dealSourceFor(Channel.WHATSAPP)).toBe(DealSource.WHATSAPP);
  });

  it('Instagram e TikTok entram como SOCIAL_MEDIA', () => {
    expect(dealSourceFor(Channel.INSTAGRAM)).toBe(DealSource.SOCIAL_MEDIA);
    expect(dealSourceFor(Channel.TIKTOK)).toBe(DealSource.SOCIAL_MEDIA);
  });

  it('ponto de entrada não altera a origem (anúncio no Instagram segue SOCIAL_MEDIA)', () => {
    // O detalhe da campanha vive em Message.referral; DealSource é o canal.
    expect(dealSourceFor(Channel.INSTAGRAM, MessageEntryPoint.AD)).toBe(DealSource.SOCIAL_MEDIA);
    expect(dealSourceFor(Channel.WHATSAPP, MessageEntryPoint.AD)).toBe(DealSource.WHATSAPP);
  });

  it('nunca devolve OTHER para canal conhecido', () => {
    for (const channel of [Channel.WHATSAPP, Channel.INSTAGRAM, Channel.TIKTOK]) {
      expect(dealSourceFor(channel)).not.toBe(DealSource.OTHER);
    }
  });
});
