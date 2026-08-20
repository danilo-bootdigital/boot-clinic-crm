import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedConversation } from '@/test/messaging-fixtures';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/mensageria/webhook/route';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const TOKEN = 'tok_A';
const COMPANY = 'companyA';
let instanceId: string;

function post(token: string | null, body: any) {
  const url = `http://localhost/api/mensageria/webhook${token ? `?token=${token}` : ''}`;
  return POST(new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

const msgEvent = (over: any = {}) => ({
  event: 'messages.upsert',
  data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: over.id ?? 'ext1' }, message: over.message ?? { conversation: 'Olá' }, pushName: over.pushName },
});

beforeEach(async () => {
  db.__reset();
  const inst = await db.channelAccount.create({ data: { companyId: COMPANY, channel: 'WHATSAPP', providerConfig: { instanceName: 'clinic_A' }, isPrimary: true, webhookToken: TOKEN, status: 'CONNECTED' } });
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
    const ev = await db.channelWebhookEvent.findMany({ where: { status: 'REJECTED' } });
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });
});

describe('webhook — recebimento de texto', () => {
  it('mensagem de texto é persistida na empresa correta', async () => {
    const res = await post(TOKEN, msgEvent());
    expect(res.status).toBe(200);
    const msgs = await db.message.findMany({ where: { companyId: COMPANY } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Olá');
    expect(msgs[0].direction).toBe('INCOMING');
    const ev = await db.channelWebhookEvent.findMany({ where: { status: 'PROCESSED' } });
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  it('mensagem com legenda (imagem) guarda caption', async () => {
    await post(TOKEN, msgEvent({ id: 'cap1', message: { imageMessage: { caption: 'legenda' } } }));
    const m = (await db.message.findMany({ where: { companyId: COMPANY } }))[0];
    expect(m.messageType).toBe('IMAGE');
    expect(m.caption).toBe('legenda');
  });

  it('contato sem nome usa telefone', async () => {
    await post(TOKEN, msgEvent({ id: 'n1', pushName: undefined }));
    // O nome vive no Contact, não na conversa (§4.4): sem pushName, o
    // identificador do canal serve de nome até alguém melhorar o cadastro.
    const contact = (await db.contact.findMany({ where: { companyId: COMPANY } }))[0];
    expect(contact.name).toBe('5511999998888');
  });
});

describe('webhook — messages.update (status enviado/entregue/lido)', () => {
  async function seedOutgoing(externalId: string, status = 'SENT') {
    const { conversation: conv } = await seedConversation(db, { companyId: COMPANY, name: 'Zé', accountId: instanceId });
    return db.message.create({ data: { companyId: COMPANY, conversationId: conv.id, channel: 'WHATSAPP', accountId: instanceId, source: 'CRM', externalId, direction: 'OUTGOING', content: 'oi', status } });
  }

  it('DELIVERY_ACK → DELIVERED com deliveredAt', async () => {
    const m = await seedOutgoing('out1');
    const res = await post(TOKEN, { event: 'messages.update', data: { keyId: 'out1', status: 'DELIVERY_ACK' } });
    const body = await res.json();
    expect(body.updated).toBe(1);
    const upd = await db.message.findFirst({ where: { id: m.id } });
    expect(upd!.status).toBe('DELIVERED');
    expect(upd!.deliveredAt).toBeTruthy();
  });

  it('READ → READ (define readAt e deliveredAt)', async () => {
    const m = await seedOutgoing('out2', 'DELIVERED');
    await post(TOKEN, { event: 'messages.update', data: [{ key: { id: 'out2' }, status: 'READ' }] });
    const upd = await db.message.findFirst({ where: { id: m.id } });
    expect(upd!.status).toBe('READ');
    expect(upd!.readAt).toBeTruthy();
  });

  it('não rebaixa: READ não volta para DELIVERED', async () => {
    const m = await seedOutgoing('out3', 'READ');
    const res = await post(TOKEN, { event: 'messages.update', data: { keyId: 'out3', status: 'DELIVERY_ACK' } });
    const body = await res.json();
    expect(body.updated).toBe(0);
    expect((await db.message.findFirst({ where: { id: m.id } }))!.status).toBe('READ');
  });

  it('externalId desconhecido é ignorado (sem erro)', async () => {
    const res = await post(TOKEN, { event: 'messages.update', data: { keyId: 'inexistente', status: 'READ' } });
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(0);
  });
});

describe('webhook — mídia não some (Etapa E)', () => {
  // Tipo NÃO suportado nesta etapa (vídeo) → placeholder controlado, sem download.
  // (Imagem/documento têm fluxo próprio de download — ver webhook-media.test.ts.)
  it('mídia não suportada (vídeo) vira placeholder, não é descartada', async () => {
    const res = await post(TOKEN, msgEvent({ id: 'vid1', message: { videoMessage: { mimetype: 'video/mp4' } } }));
    const body = await res.json();
    expect(body.placeholder).toBe(1);
    const m = (await db.message.findMany({ where: { companyId: COMPANY } }))[0];
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
    expect(await db.message.count({ where: { companyId: COMPANY } })).toBe(1);
  });

  it('grupo (@g.us) é ignorado', async () => {
    const res = await post(TOKEN, { event: 'messages.upsert', data: { key: { remoteJid: '123-456@g.us', fromMe: false, id: 'g1' }, message: { conversation: 'grupo' } } });
    expect(res.status).toBe(200);
    expect(await db.message.count({ where: { companyId: COMPANY } })).toBe(0);
  });

  it('evento não suportado é aceito sem erro (SKIPPED)', async () => {
    const res = await post(TOKEN, { event: 'presence.update', data: {} });
    expect(res.status).toBe(200);
    const ev = await db.channelWebhookEvent.findMany({ where: { eventType: 'presence.update' } });
    expect(ev[0]?.status).toBe('SKIPPED');
  });

  it('mensagem do celular (fromMe) → OUTGOING/MOBILE', async () => {
    await post(TOKEN, { event: 'messages.upsert', data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: 'me1' }, message: { conversation: 'daqui' } } });
    const m = (await db.message.findMany({ where: { companyId: COMPANY } }))[0];
    expect(m.direction).toBe('OUTGOING');
    expect(m.source).toBe('MOBILE');
  });
});

// Regressão: o handler de reconexão gravava `qrCode`/`phoneNumber`/`profileName`,
// que NÃO são colunas de ChannelAccount. O update inteiro estourava, o
// "CONNECTED" nunca era persistido e a conta ficava presa em DISCONNECTED —
// então todo envio caía em PENDING silencioso ("fica enviando e não vai").
describe('webhook — CONNECTION_UPDATE', () => {
  const connEvent = (state: string, over: any = {}) => ({
    event: 'connection.update',
    data: { state, wuid: over.wuid, profileName: over.profileName },
  });

  it('state=open → conta volta para CONNECTED', async () => {
    await db.channelAccount.update({ where: { id: instanceId }, data: { status: 'DISCONNECTED', disconnectedAt: new Date() } });

    const res = await post(TOKEN, connEvent('open', { wuid: '5519971486011@s.whatsapp.net', profileName: 'Clínica' }));
    expect(res.status).toBe(200);

    const acc = await db.channelAccount.findUnique({ where: { id: instanceId } });
    expect(acc!.status).toBe('CONNECTED');
    expect(acc!.lastConnectedAt).toBeTruthy();
    expect(acc!.disconnectedAt).toBeNull();
    // Nenhum evento FAILED: o update não pode estourar mais.
    const falhas = await db.channelWebhookEvent.findMany({ where: { status: 'FAILED' } });
    expect(falhas).toHaveLength(0);
  });

  it('identidade do número vai para as colunas REAIS (externalId/displayName)', async () => {
    await post(TOKEN, connEvent('open', { wuid: '5519971486011@s.whatsapp.net', profileName: 'Clínica' }));
    const acc = await db.channelAccount.findUnique({ where: { id: instanceId } });
    expect(acc!.externalId).toBe('5519971486011');
    expect(acc!.displayName).toBe('Clínica');
    // QR do pareamento sai do providerConfig, e o instanceName sobrevive.
    expect((acc!.providerConfig as any).qrCode).toBeUndefined();
    expect((acc!.providerConfig as any).instanceName).toBe('clinic_A');
  });

  it('state=close → DISCONNECTED com carimbo', async () => {
    const res = await post(TOKEN, connEvent('close'));
    expect(res.status).toBe(200);
    const acc = await db.channelAccount.findUnique({ where: { id: instanceId } });
    expect(acc!.status).toBe('DISCONNECTED');
    expect(acc!.disconnectedAt).toBeTruthy();
  });
});
