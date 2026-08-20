import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedConversation } from '@/test/messaging-fixtures';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));
vi.mock('@/lib/messaging/adapters/whatsapp/evolution', () => ({ sendWhatsappForConversation: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { POST, GET } from '@/app/api/mensageria/messages/route';
import { resolveModuleUser } from '@/lib/api/session';
import { sendWhatsappForConversation } from '@/lib/messaging/adapters/whatsapp/evolution';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const asUser = (companyId: string) => ({ dbUser: { id: 'u1', name: 'User', companyId } });

function postReq(body: any) {
  return new NextRequest('http://localhost/api/mensageria/messages', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}
function getReq(conversationId: string) {
  return new NextRequest(`http://localhost/api/mensageria/messages?conversationId=${conversationId}`, { method: 'GET' });
}

let convA: any;
beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue(asUser('A') as any);
  vi.mocked(sendWhatsappForConversation).mockReset();
  convA = (await seedConversation(db, { companyId: 'A', name: 'Zé', accountId: 'instA' })).conversation;
});

describe('POST /messages — envio de texto', () => {
  it('Evolution OK → 201 status SENT com sentAt', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext1', instanceId: 'instA' } as any);
    const res = await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('SENT');
    expect(body.sentAt).toBeTruthy();
    expect(body.messageType).toBe('TEXT');
  });

  it('Evolution não configurada → PENDING', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: false, ok: false } as any);
    const res = await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    const body = await res.json();
    expect(body.status).toBe('PENDING');
  });

  it('Evolution com erro → FAILED', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: false, error: 'HTTP 500' } as any);
    const res = await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    const body = await res.json();
    expect(body.status).toBe('FAILED');
  });

  it('payload inválido (content vazio) → 400', async () => {
    const res = await POST(postReq({ conversationId: convA.id, content: '' }));
    expect(res.status).toBe(400);
  });

  it('conversa inexistente → 404', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: false, ok: false } as any);
    const res = await POST(postReq({ conversationId: 'nao-existe', content: 'oi' }));
    expect(res.status).toBe(404);
  });

  // Regressão: a clínica reclamou de mensagem chegando 2-5x no paciente. Cada
  // Enter durante a resposta do provedor era um envio novo. O servidor precisa
  // recusar o segundo envio idêntico, independente do que o cliente faça.
  it('mesmo texto reenviado na sequência → não chama o provedor de novo', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext1', instanceId: 'instA' } as any);
    const primeiro = await (await POST(postReq({ conversationId: convA.id, content: 'oi' }))).json();

    const res = await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    const segundo = await res.json();

    expect(res.status).toBe(200);
    expect(segundo.deduplicated).toBe(true);
    expect(segundo.id).toBe(primeiro.id);
    expect(vi.mocked(sendWhatsappForConversation)).toHaveBeenCalledTimes(1);
    expect(await db.message.count({ where: { conversationId: convA.id } })).toBe(1);
  });

  it('texto diferente na sequência → envia normalmente', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext1', instanceId: 'instA' } as any);
    await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext2', instanceId: 'instA' } as any);
    const res = await POST(postReq({ conversationId: convA.id, content: 'tudo bem?' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(sendWhatsappForConversation)).toHaveBeenCalledTimes(2);
  });

  // Depois de uma falha, repetir o mesmo texto é reenvio legítimo — a janela de
  // idempotência não pode transformar erro do provedor em mensagem engolida.
  it('envio anterior FAILED → mesmo texto é reenviado', async () => {
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: false, error: 'HTTP 500' } as any);
    await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext9', instanceId: 'instA' } as any);
    const res = await POST(postReq({ conversationId: convA.id, content: 'oi' }));
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe('SENT');
    expect(vi.mocked(sendWhatsappForConversation)).toHaveBeenCalledTimes(2);
  });

  it('conversa de OUTRA empresa → 404 (isolamento)', async () => {
    const convB = (await seedConversation(db, { companyId: 'B', name: 'Outro', phone: '5511000000000' })).conversation;
    vi.mocked(sendWhatsappForConversation).mockResolvedValue({ configured: false, ok: false } as any);
    const res = await POST(postReq({ conversationId: convB.id, content: 'oi' }));
    expect(res.status).toBe(404);
    expect(vi.mocked(sendWhatsappForConversation)).not.toHaveBeenCalled();
  });
});

describe('GET /messages — isolamento', () => {
  it('lista mensagens da conversa da própria empresa', async () => {
    await db.message.create({ data: { companyId: 'A', conversationId: convA.id, content: 'oi', direction: 'INCOMING', status: 'RECEIVED' } });
    const res = await GET(getReq(convA.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it('conversa de outra empresa → 404', async () => {
    const convB = (await seedConversation(db, { companyId: 'B', name: 'X', phone: '5511000000000' })).conversation;
    const res = await GET(getReq(convB.id));
    expect(res.status).toBe(404);
  });
});
