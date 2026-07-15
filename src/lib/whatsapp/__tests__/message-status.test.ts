import { describe, it, expect } from 'vitest';
import { ackToStatus, statusPatch } from '@/lib/whatsapp/message-status';

const NOW = new Date('2026-07-15T12:00:00Z');

describe('ackToStatus — vocabulário do WhatsApp/Evolution', () => {
  it('mapeia strings confirmadas ao vivo', () => {
    expect(ackToStatus('SERVER_ACK')).toBe('SENT');
    expect(ackToStatus('DELIVERY_ACK')).toBe('DELIVERED');
    expect(ackToStatus('READ')).toBe('READ');
    expect(ackToStatus('PLAYED')).toBe('READ');
    expect(ackToStatus('ERROR')).toBe('FAILED');
  });
  it('ignora pendente/desconhecido/nulo', () => {
    expect(ackToStatus('PENDING')).toBeNull();
    expect(ackToStatus('QUALQUER')).toBeNull();
    expect(ackToStatus(null)).toBeNull();
    expect(ackToStatus(undefined)).toBeNull();
  });
  it('aceita ACK numérico do Baileys (0 ignorado)', () => {
    expect(ackToStatus(0)).toBeNull();
    expect(ackToStatus(1)).toBe('SENT');
    expect(ackToStatus(2)).toBe('DELIVERED');
    expect(ackToStatus(3)).toBe('READ');
    expect(ackToStatus(4)).toBe('READ');
  });
});

describe('statusPatch — nunca rebaixa, carimba timestamps', () => {
  it('SENT → DELIVERED define deliveredAt', () => {
    const p = statusPatch({ status: 'SENT', deliveredAt: null, readAt: null }, 'DELIVERED', NOW);
    expect(p).toEqual({ status: 'DELIVERED', deliveredAt: NOW });
  });
  it('DELIVERED → READ define readAt e mantém deliveredAt', () => {
    const prev = new Date('2026-07-15T11:00:00Z');
    const p = statusPatch({ status: 'DELIVERED', deliveredAt: prev, readAt: null }, 'READ', NOW);
    expect(p).toEqual({ status: 'READ', readAt: NOW, deliveredAt: prev });
  });
  it('READ implica deliveredAt quando ausente', () => {
    const p = statusPatch({ status: 'SENT', deliveredAt: null, readAt: null }, 'READ', NOW);
    expect(p).toEqual({ status: 'READ', readAt: NOW, deliveredAt: NOW });
  });
  it('não rebaixa: READ → DELIVERED = null', () => {
    expect(statusPatch({ status: 'READ' }, 'DELIVERED', NOW)).toBeNull();
  });
  it('não repete: DELIVERED → DELIVERED = null', () => {
    expect(statusPatch({ status: 'DELIVERED' }, 'DELIVERED', NOW)).toBeNull();
  });
  it('FAILED só antes de entregue', () => {
    expect(statusPatch({ status: 'SENT' }, 'FAILED', NOW)).toEqual({ status: 'FAILED', failedAt: NOW });
    expect(statusPatch({ status: 'DELIVERED' }, 'FAILED', NOW)).toBeNull();
    expect(statusPatch({ status: 'READ' }, 'FAILED', NOW)).toBeNull();
  });
});
