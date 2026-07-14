import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));
vi.mock('@/lib/storage/whatsapp-storage', () => ({ uploadWhatsappMedia: vi.fn(), deleteWhatsappMedia: vi.fn() }));
vi.mock('@/lib/whatsapp/evolution', () => ({ sendMediaForConversation: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/whatsapp/messages/media/route';
import { resolveModuleUser } from '@/lib/api/session';
import { uploadWhatsappMedia, deleteWhatsappMedia } from '@/lib/storage/whatsapp-storage';
import { sendMediaForConversation } from '@/lib/whatsapp/evolution';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

function jpeg(size = 1024): Uint8Array { const a = new Uint8Array(size); a.set([0xff, 0xd8, 0xff, 0xe0]); return a; }

function mediaReq(opts: { bytes: Uint8Array; name: string; type: string; conversationId: string; caption?: string; companyId?: string }) {
  const fd = new FormData();
  fd.append('file', new File([opts.bytes as unknown as BlobPart], opts.name, { type: opts.type }));
  fd.append('conversationId', opts.conversationId);
  if (opts.caption) fd.append('caption', opts.caption);
  if (opts.companyId) fd.append('companyId', opts.companyId); // deve ser IGNORADO
  return new NextRequest('http://localhost/api/whatsapp/messages/media', { method: 'POST', body: fd });
}

let convA: any;
beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id: 'u1', name: 'U', companyId: 'A' } } as any);
  vi.mocked(uploadWhatsappMedia).mockReset();
  vi.mocked(deleteWhatsappMedia).mockReset();
  vi.mocked(sendMediaForConversation).mockReset();
  vi.mocked(uploadWhatsappMedia).mockResolvedValue({ path: 'A/convA/m/uuid-a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, checksum: 'abc', originalFileName: 'a.jpg' } as any);
  vi.mocked(deleteWhatsappMedia).mockResolvedValue(true);
  convA = await db.whatsAppConversation.create({ data: { companyId: 'A', contactName: 'Zé', contactPhone: '5511999998888', instanceId: 'instA', status: 'OPEN' } });
});

describe('POST /messages/media — sucesso', () => {
  it('imagem JPEG válida → 201, mensagem + anexo, mediaStatus AVAILABLE, SENT', async () => {
    vi.mocked(sendMediaForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'ext1', instanceId: 'instA' } as any);
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id, caption: 'olha' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('SENT');
    expect(body.mediaStatus).toBe('AVAILABLE');
    expect(body.messageType).toBe('IMAGE');
    expect(body.attachment?.mimeType).toBe('image/jpeg');
    expect(body.attachment?.id).toBeTruthy();
    expect(body.storagePath).toBeUndefined();
    expect(await db.whatsAppMessage.count({ where: { companyId: 'A' } })).toBe(1);
    expect(await db.whatsAppAttachment.count({ where: { companyId: 'A' } })).toBe(1);
  });

  it('companyId do frontend é IGNORADO (usa a sessão)', async () => {
    vi.mocked(sendMediaForConversation).mockResolvedValue({ configured: true, ok: true, messageId: 'e', instanceId: 'instA' } as any);
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id, companyId: 'B' }));
    expect(res.status).toBe(201);
    const att = (await db.whatsAppAttachment.findMany({}))[0];
    expect(att.companyId).toBe('A'); // nunca 'B'
  });

  it('Evolution não configurada → PENDING (arquivo já armazenado)', async () => {
    vi.mocked(sendMediaForConversation).mockResolvedValue({ configured: false, ok: false } as any);
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id }));
    const body = await res.json();
    expect(body.status).toBe('PENDING');
    expect(body.mediaStatus).toBe('AVAILABLE');
  });

  it('Evolution falha → FAILED mas anexo é preservado (permite retry)', async () => {
    vi.mocked(sendMediaForConversation).mockResolvedValue({ configured: true, ok: false, error: 'HTTP 500' } as any);
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('FAILED');
    expect(await db.whatsAppAttachment.count({ where: { companyId: 'A' } })).toBe(1);
  });
});

describe('POST /messages/media — validação', () => {
  it('conversa de outra empresa → 404 (isolamento)', async () => {
    const convB = await db.whatsAppConversation.create({ data: { companyId: 'B', contactName: 'X', contactPhone: '5511000000000', status: 'OPEN' } });
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convB.id }));
    expect(res.status).toBe(404);
    expect(vi.mocked(uploadWhatsappMedia)).not.toHaveBeenCalled();
  });

  it('tipo não suportado → 400', async () => {
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'x.svg', type: 'image/svg+xml', conversationId: convA.id }));
    expect(res.status).toBe(400);
  });

  it('MIME forjado (png declarado, bytes jpeg) → 400', async () => {
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'x.png', type: 'image/png', conversationId: convA.id }));
    expect(res.status).toBe(400);
  });

  it('arquivo vazio → 400', async () => {
    const res = await POST(mediaReq({ bytes: new Uint8Array(0), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id }));
    expect(res.status).toBe(400);
  });

  it('acima do limite → 400', async () => {
    const big = jpeg(10 * 1024 * 1024 + 1);
    const res = await POST(mediaReq({ bytes: big, name: 'g.jpg', type: 'image/jpeg', conversationId: convA.id }));
    expect(res.status).toBe(400);
  });
});

describe('POST /messages/media — consistência transacional', () => {
  it('falha no storage → mensagem FAILED, sem anexo, 502', async () => {
    vi.mocked(uploadWhatsappMedia).mockRejectedValue(new Error('storage down'));
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id }));
    expect(res.status).toBe(502);
    expect(await db.whatsAppAttachment.count({})).toBe(0);
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: 'A' } }))[0];
    expect(msg.status).toBe('FAILED');
    expect(msg.mediaStatus).toBe('FAILED');
  });

  it('falha no banco após upload → compensa (deleta arquivo), 500, sem órfão', async () => {
    const orig = db.whatsAppAttachment.create.bind(db.whatsAppAttachment);
    vi.spyOn(db.whatsAppAttachment, 'create').mockRejectedValueOnce(new Error('db down'));
    const res = await POST(mediaReq({ bytes: jpeg(), name: 'a.jpg', type: 'image/jpeg', conversationId: convA.id }));
    expect(res.status).toBe(500);
    expect(vi.mocked(deleteWhatsappMedia)).toHaveBeenCalledWith('A/convA/m/uuid-a.jpg', 'A');
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: 'A' } }))[0];
    expect(msg.status).toBe('FAILED');
    void orig;
  });
});
