import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

const refresh = vi.fn();
vi.mock('@/lib/messaging/adapters/whatsapp/evolution', async (orig) => ({
  ...(await orig<typeof import('@/lib/messaging/adapters/whatsapp/evolution')>()),
  refreshWebhookEvents: (...a: unknown[]) => refresh(...a),
}));

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/mensageria/webhook/route';
import { WEBHOOK_EVENTS_VERSION } from '@/lib/messaging/adapters/whatsapp/evolution';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const TOKEN = 'tok_A';
let instanceId: string;

const post = () =>
  POST(new NextRequest(`http://localhost/api/mensageria/webhook?token=${TOKEN}`, {
    method: 'POST',
    body: JSON.stringify({ event: 'contacts.update', data: [] }),
    headers: { 'content-type': 'application/json' },
  }));

beforeEach(async () => {
  db.__reset();
  refresh.mockReset();
  const inst = await db.channelAccount.create({
    data: { companyId: 'companyA', channel: 'WHATSAPP', providerConfig: { instanceName: 'clinic_A' }, isPrimary: true, webhookToken: TOKEN, status: 'CONNECTED', providerEventsVersion: 1 },
  });
  instanceId = inst.id;
});

describe('webhook — eventos defasados se atualizam sem reconectar', () => {
  it('1º evento atualiza a assinatura uma única vez', async () => {
    refresh.mockResolvedValue({ configured: true, ok: true });
    await post();
    await post();
    expect(refresh).toHaveBeenCalledTimes(1);
    const acc = await db.channelAccount.findUnique({ where: { id: instanceId } });
    expect(acc!.providerEventsVersion).toBe(WEBHOOK_EVENTS_VERSION);
    expect(acc!.status).toBe('CONNECTED');
  });

  it('Evolution recusou → versão volta e tenta de novo no próximo evento', async () => {
    refresh.mockResolvedValueOnce({ configured: true, ok: false, error: 'HTTP 500' });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await db.channelAccount.findUnique({ where: { id: instanceId } }))!.providerEventsVersion).toBe(1);
    refresh.mockResolvedValueOnce({ configured: true, ok: true });
    await post();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
