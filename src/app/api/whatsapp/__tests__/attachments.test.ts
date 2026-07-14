import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));
vi.mock('@/lib/storage/whatsapp-storage', () => ({ createWhatsappMediaSignedUrl: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { GET } from '@/app/api/whatsapp/attachments/[id]/route';
import { resolveModuleUser } from '@/lib/api/session';
import { createWhatsappMediaSignedUrl } from '@/lib/storage/whatsapp-storage';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const req = () => new NextRequest('http://localhost/api/whatsapp/attachments/x', { method: 'GET' });

beforeEach(() => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id: 'u1', name: 'U', companyId: 'A' } } as any);
  vi.mocked(createWhatsappMediaSignedUrl).mockReset();
});

async function seedAttachment(companyId: string, extra: any = {}) {
  return db.whatsAppAttachment.create({ data: { companyId, messageId: 'm1', storagePath: `${companyId}/c/m/uuid-a.jpg`, mimeType: 'image/jpeg', sizeBytes: 100, originalFileName: 'a.jpg', ...extra } });
}

describe('GET /attachments/[id]', () => {
  it('anexo da própria empresa → 200 com signed URL (sem storagePath)', async () => {
    const att = await seedAttachment('A');
    vi.mocked(createWhatsappMediaSignedUrl).mockResolvedValue('https://signed/x');
    const res = await GET(req(), { params: { id: att.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://signed/x');
    expect(body.storagePath).toBeUndefined();
    expect(body.mimeType).toBe('image/jpeg');
  });

  it('anexo de OUTRA empresa → 404 (isolamento)', async () => {
    const att = await seedAttachment('B');
    const res = await GET(req(), { params: { id: att.id } });
    expect(res.status).toBe(404);
    expect(vi.mocked(createWhatsappMediaSignedUrl)).not.toHaveBeenCalled();
  });

  it('anexo soft-deletado → 404', async () => {
    const att = await seedAttachment('A', { deletedAt: new Date() });
    const res = await GET(req(), { params: { id: att.id } });
    expect(res.status).toBe(404);
  });

  it('signed URL indisponível → 409', async () => {
    const att = await seedAttachment('A');
    vi.mocked(createWhatsappMediaSignedUrl).mockResolvedValue(null);
    const res = await GET(req(), { params: { id: att.id } });
    expect(res.status).toBe(409);
  });
});
