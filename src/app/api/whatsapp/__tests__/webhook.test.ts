import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/whatsapp/webhook/route';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const TOKEN = 'tok_A';
const COMPANY = 'companyA';
let instanceId: string;

function post(token: string | null, body: any) {
  const url = `http://localhost/api/whatsapp/webhook${token ? `?token=${token}` : ''}`;
  return POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

const msgEvent = (over: any = {}) => ({
  event: 'messages.upsert',
  data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: over.id ?? 'ext1' }, message: over.message ?? { conversation: 'Olá' }, pushName: over.pushName },
});

beforeEach(async () => {
  db.__reset();
  const inst = await db.whatsAppInstance.create({ data: { companyId: COMPANY, instanceName: 'clinic_A', isPrimary: true, webhookToken: TOKEN, status: 'CONNECTED' } });
  instanceId = inst.id;
});

describe('webhook — autenticação', () => {
  it('sem token → 401', async () => {
    const res = await post(null, msgEvent());
    expect(res.status).toBe(401);
  });
  it('token inválido → 401 e evento REJECTED registrado', async () => {
    const res = await post('token_errado', msgEvent());
    expect(res.status).toBe(401);
    const ev = await db.whatsAppWebhookEvent.findMany({ where: { status: 'REJECTED' } });
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });
});

describe('webhook — recebimento de texto', () => {
  it('mensagem de texto é persistida na empresa correta', async () => {
    const res = await post(TOKEN, msgEvent());
    expect(res.status).toBe(200);
    const msgs = await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Olá');
    expect(msgs[0].direction).toBe('INCOMING');
    const ev = await db.whatsAppWebhookEvent.findMany({ where: { status: 'PROCESSED' } });
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  it('mensagem com legenda (imagem) guarda caption', async () => {
    await post(TOKEN, msgEvent({ id: 'cap1', message: { imageMessage: { caption: 'legenda' } } }));
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(m.messageType).toBe('IMAGE');
    expect(m.caption).toBe('legenda');
  });

  it('contato sem nome usa telefone', async () => {
    await post(TOKEN, msgEvent({ id: 'n1', pushName: undefined }));
    const conv = (await db.whatsAppConversation.findMany({ where: { companyId: COMPANY } }))[0];
    expect(conv.contactName).toBe('5511999998888');
  });
});

describe('webhook — mídia não some (Etapa E)', () => {
  // Tipo NÃO suportado nesta etapa (vídeo) → placeholder controlado, sem download.
  // (Imagem/documento têm fluxo próprio de download — ver webhook-media.test.ts.)
  it('mídia não suportada (vídeo) vira placeholder, não é descartada', async () => {
    const res = await post(TOKEN, msgEvent({ id: 'vid1', message: { videoMessage: { mimetype: 'video/mp4' } } }));
    const body = await res.json();
    expect(body.placeholder).toBe(1);
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(m.messageType).toBe('VIDEO');
    expect(m.content).toBe('🎬 Vídeo');
  });
});

describe('webhook — idempotência e casos', () => {
  it('mesmo externalId duas vezes não duplica', async () => {
    await post(TOKEN, msgEvent({ id: 'dupX' }));
    const res2 = await post(TOKEN, msgEvent({ id: 'dupX' }));
    const body2 = await res2.json();
    expect(body2.duplicate).toBe(1);
    expect(await db.whatsAppMessage.count({ where: { companyId: COMPANY } })).toBe(1);
  });

  it('grupo (@g.us) é ignorado', async () => {
    const res = await post(TOKEN, { event: 'messages.upsert', data: { key: { remoteJid: '123-456@g.us', fromMe: false, id: 'g1' }, message: { conversation: 'grupo' } } });
    expect(res.status).toBe(200);
    expect(await db.whatsAppMessage.count({ where: { companyId: COMPANY } })).toBe(0);
  });

  it('evento não suportado é aceito sem erro (SKIPPED)', async () => {
    const res = await post(TOKEN, { event: 'presence.update', data: {} });
    expect(res.status).toBe(200);
    const ev = await db.whatsAppWebhookEvent.findMany({ where: { eventType: 'presence.update' } });
    expect(ev[0]?.status).toBe('SKIPPED');
  });

  it('mensagem do celular (fromMe) → OUTGOING/MOBILE', async () => {
    await post(TOKEN, { event: 'messages.upsert', data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: 'me1' }, message: { conversation: 'daqui' } } });
    const m = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(m.direction).toBe('OUTGOING');
    expect(m.source).toBe('MOBILE');
  });
});
