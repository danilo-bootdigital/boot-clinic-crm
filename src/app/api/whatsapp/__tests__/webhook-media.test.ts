import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/whatsapp/evolution', () => ({ getMediaBase64: vi.fn() }));
vi.mock('@/lib/storage/whatsapp-storage', () => ({ uploadWhatsappMedia: vi.fn() }));

import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/whatsapp/webhook/route';
import { getMediaBase64 } from '@/lib/whatsapp/evolution';
import { uploadWhatsappMedia } from '@/lib/storage/whatsapp-storage';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const TOKEN = 'tok_media';
const COMPANY = 'companyA';

function post(body: any) {
  return POST(new NextRequest(`http://localhost/api/whatsapp/webhook?token=${TOKEN}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

const imageEvent = (over: any = {}) => ({
  event: 'messages.upsert',
  data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: over.id ?? 'img1' }, message: over.message ?? { imageMessage: { mimetype: 'image/jpeg', caption: over.caption } }, pushName: 'Paciente' },
});

beforeEach(async () => {
  db.__reset();
  vi.mocked(getMediaBase64).mockReset();
  vi.mocked(uploadWhatsappMedia).mockReset();
  await db.whatsAppInstance.create({ data: { companyId: COMPANY, instanceName: 'clinic_A', isPrimary: true, webhookToken: TOKEN, status: 'CONNECTED' } });
});

describe('webhook — recebimento de mídia (imagem/documento)', () => {
  it('imagem: baixa, armazena e cria anexo (mediaStatus AVAILABLE)', async () => {
    vi.mocked(getMediaBase64).mockResolvedValue({ configured: true, ok: true, base64: 'AAAA', mimetype: 'image/jpeg', fileName: 'foto.jpg' } as any);
    vi.mocked(uploadWhatsappMedia).mockResolvedValue({ path: `${COMPANY}/c/m/uuid-foto.jpg`, mimeType: 'image/jpeg', sizeBytes: 3, checksum: 'x', originalFileName: 'foto.jpg' } as any);
    const res = await post(imageEvent({ caption: 'olha isso' }));
    const body = await res.json();
    expect(body.media).toBe(1);
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(msg.messageType).toBe('IMAGE');
    expect(msg.caption).toBe('olha isso');
    expect(msg.mediaStatus).toBe('AVAILABLE');
    expect(await db.whatsAppAttachment.count({ where: { companyId: COMPANY } })).toBe(1);
  });

  it('imagem sem legenda: placeholder no content, mas mídia baixada', async () => {
    vi.mocked(getMediaBase64).mockResolvedValue({ configured: true, ok: true, base64: 'AAAA', mimetype: 'image/jpeg', fileName: 'f.jpg' } as any);
    vi.mocked(uploadWhatsappMedia).mockResolvedValue({ path: `${COMPANY}/c/m/uuid-f.jpg`, mimeType: 'image/jpeg', sizeBytes: 3, originalFileName: 'f.jpg' } as any);
    await post(imageEvent({ id: 'img2' }));
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(msg.content).toBe('📷 Imagem');
    expect(msg.mediaStatus).toBe('AVAILABLE');
  });

  it('falha no download → mensagem PERMANECE com mediaStatus FAILED (não some)', async () => {
    vi.mocked(getMediaBase64).mockResolvedValue({ configured: true, ok: false } as any);
    const res = await post(imageEvent({ id: 'img3' }));
    const body = await res.json();
    expect(body.mediaFailed).toBe(1);
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(msg.messageType).toBe('IMAGE');
    expect(msg.mediaStatus).toBe('FAILED');
    expect(await db.whatsAppAttachment.count({})).toBe(0);
  });

  it('mídia duplicada (mesmo externalId) é idempotente', async () => {
    vi.mocked(getMediaBase64).mockResolvedValue({ configured: true, ok: true, base64: 'AAAA', mimetype: 'image/jpeg', fileName: 'f.jpg' } as any);
    vi.mocked(uploadWhatsappMedia).mockResolvedValue({ path: `${COMPANY}/c/m/uuid-f.jpg`, mimeType: 'image/jpeg', sizeBytes: 3, originalFileName: 'f.jpg' } as any);
    await post(imageEvent({ id: 'dup' }));
    const res2 = await post(imageEvent({ id: 'dup' }));
    const body2 = await res2.json();
    expect(body2.duplicate).toBe(1);
    expect(await db.whatsAppMessage.count({ where: { companyId: COMPANY } })).toBe(1);
  });

  it('tipo não suportado (vídeo) não some — vira placeholder, sem download', async () => {
    const res = await post({ event: 'messages.upsert', data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'vid1' }, message: { videoMessage: { mimetype: 'video/mp4' } } } });
    const body = await res.json();
    expect(body.placeholder).toBe(1);
    expect(vi.mocked(getMediaBase64)).not.toHaveBeenCalled();
    const msg = (await db.whatsAppMessage.findMany({ where: { companyId: COMPANY } }))[0];
    expect(msg.messageType).toBe('VIDEO');
    expect(msg.content).toBe('🎬 Vídeo');
  });
});
