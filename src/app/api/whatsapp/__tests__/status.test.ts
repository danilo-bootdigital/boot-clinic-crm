import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regressão do ciclo de vida da instância (não deve quebrar com a nova fundação).
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));
vi.mock('@/lib/whatsapp/evolution', () => ({
  isEvolutionConfigured: vi.fn(),
  getPrimaryInstance: vi.fn(),
  syncConnectionState: vi.fn(),
}));

import { GET } from '@/app/api/whatsapp/status/route';
import { resolveModuleUser } from '@/lib/api/session';
import { isEvolutionConfigured, getPrimaryInstance, syncConnectionState } from '@/lib/whatsapp/evolution';

beforeEach(() => {
  vi.mocked(resolveModuleUser).mockResolvedValue({ dbUser: { id: 'u1', name: 'U', companyId: 'A' } } as any);
  vi.mocked(isEvolutionConfigured).mockReset();
  vi.mocked(getPrimaryInstance).mockReset();
  vi.mocked(syncConnectionState).mockReset();
});

describe('GET /status', () => {
  it('instância conectada → status CONNECTED', async () => {
    const inst = { id: 'i1', companyId: 'A', status: 'CONNECTED', phoneNumber: '5511999998888', profileName: 'Clínica', label: 'Principal', lastConnectedAt: new Date(), disconnectedAt: null, qrCode: null };
    vi.mocked(isEvolutionConfigured).mockReturnValue(true);
    vi.mocked(getPrimaryInstance).mockResolvedValue(inst as any);
    vi.mocked(syncConnectionState).mockResolvedValue(inst as any);
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe('CONNECTED');
    expect(body.hasInstance).toBe(true);
    expect(vi.mocked(syncConnectionState)).toHaveBeenCalledOnce();
  });

  it('sem instância → hasInstance false, DISCONNECTED', async () => {
    vi.mocked(isEvolutionConfigured).mockReturnValue(true);
    vi.mocked(getPrimaryInstance).mockResolvedValue(null as any);
    const res = await GET();
    const body = await res.json();
    expect(body.hasInstance).toBe(false);
    expect(body.status).toBe('DISCONNECTED');
    expect(vi.mocked(syncConnectionState)).not.toHaveBeenCalled();
  });

  it('Evolution não configurada → não sincroniza, configured false', async () => {
    vi.mocked(isEvolutionConfigured).mockReturnValue(false);
    vi.mocked(getPrimaryInstance).mockResolvedValue({ id: 'i1', companyId: 'A', status: 'DISCONNECTED', qrCode: null } as any);
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(vi.mocked(syncConnectionState)).not.toHaveBeenCalled();
  });
});
