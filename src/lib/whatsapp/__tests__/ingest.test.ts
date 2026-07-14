import { describe, it, expect, beforeEach, vi } from 'vitest';

// prisma em memória (compartilhado com o SUT via mock do módulo).
vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import { ingestMessage } from '@/lib/whatsapp/ingest';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

beforeEach(() => db.__reset());

const A = 'companyA';
const INST = 'instA';

describe('ingestMessage — texto', () => {
  it('cria mensagem de texto (INCOMING) e a conversa', async () => {
    const r = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', name: 'João', text: 'Olá', externalId: 'x1', fromMe: false });
    expect(r).toBe('created');
    const msgs = await db.whatsAppMessage.findMany({ where: { companyId: A } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Olá');
    expect(msgs[0].messageType).toBe('TEXT');
    expect(msgs[0].direction).toBe('INCOMING');
    expect(msgs[0].source).toBe('CONTACT');
  });

  it('mensagem enviada pelo celular (fromMe) → OUTGOING/MOBILE', async () => {
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'oi', externalId: 'x2', fromMe: true });
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: A } }))[0];
    expect(m.direction).toBe('OUTGOING');
    expect(m.source).toBe('MOBILE');
  });

  it('contato sem nome usa o telefone como contactName', async () => {
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511777776666', text: 'oi', externalId: 'x3', fromMe: false });
    const conv = (await db.whatsAppConversation.findMany({ where: { companyId: A } }))[0];
    expect(conv.contactName).toBe('5511777776666');
  });
});

describe('ingestMessage — deduplicação', () => {
  it('mesmo (instanceId, externalId) não duplica', async () => {
    const r1 = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'a', externalId: 'dup', fromMe: false });
    const r2 = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'a', externalId: 'dup', fromMe: false });
    expect(r1).toBe('created');
    expect(r2).toBe('duplicate');
    expect(await db.whatsAppMessage.count({ where: { companyId: A } })).toBe(1);
  });

  it('externalIds diferentes persistem ambos', async () => {
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'a', externalId: 'e1', fromMe: false });
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'b', externalId: 'e2', fromMe: false });
    expect(await db.whatsAppMessage.count({ where: { companyId: A } })).toBe(2);
  });

  it('eco do CRM (mesmo externalId já gravado) não duplica', async () => {
    // Simula a mensagem gravada pela rota de envio (source=CRM) com externalId.
    await db.whatsAppMessage.create({ data: { companyId: A, conversationId: 'c0', instanceId: INST, externalId: 'echo', source: 'CRM', content: 'oi', direction: 'OUTGOING', status: 'SENT' } });
    const r = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'oi', externalId: 'echo', fromMe: true });
    expect(r).toBe('duplicate');
    expect(await db.whatsAppMessage.count({ where: { instanceId: INST, externalId: 'echo' } })).toBe(1);
  });
});

describe('ingestMessage — mídia não descartada silenciosamente (Etapa E)', () => {
  it('mídia sem legenda vira placeholder controlado (não some)', async () => {
    const r = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', messageType: 'IMAGE', externalId: 'img1', fromMe: false });
    expect(r).toBe('placeholder');
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: A } }))[0];
    expect(m.messageType).toBe('IMAGE');
    expect(m.content).toBe('📷 Imagem');
  });

  it('mídia COM legenda guarda texto em content e caption', async () => {
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'olha isso', messageType: 'IMAGE', externalId: 'img2', fromMe: false });
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: A } }))[0];
    expect(m.content).toBe('olha isso');
    expect(m.caption).toBe('olha isso');
    expect(m.messageType).toBe('IMAGE');
  });

  it('evento sem conteúdo utilizável é ignorado (skipped)', async () => {
    const r = await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', messageType: null, externalId: 'empty', fromMe: false });
    expect(r).toBe('skipped');
    expect(await db.whatsAppMessage.count({ where: { companyId: A } })).toBe(0);
  });

  it('sem telefone → skipped', async () => {
    const r = await ingestMessage({ companyId: A, instanceId: INST, phone: '', text: 'x', fromMe: false });
    expect(r).toBe('skipped');
  });
});

describe('ingestMessage — isolamento multiempresa', () => {
  it('mensagem gravada leva o companyId correto e não aparece p/ outra empresa', async () => {
    await ingestMessage({ companyId: A, instanceId: INST, phone: '5511999998888', text: 'a', externalId: 'iso', fromMe: false });
    expect(await db.whatsAppMessage.count({ where: { companyId: A } })).toBe(1);
    expect(await db.whatsAppMessage.count({ where: { companyId: 'companyB' } })).toBe(0);
  });
});
