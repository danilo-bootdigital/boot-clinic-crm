import { describe, it, expect } from 'vitest';
import { ackToStatus, statusPatch } from '@/lib/messaging/adapters/whatsapp/message-status';

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
  it('ACK numérico segue o enum proto do Baileys (não o whatsapp-web.js)', () => {
    expect(ackToStatus(-1)).toBe('FAILED'); // erro (defensivo, estilo wwebjs)
    expect(ackToStatus(0)).toBe('FAILED');  // ERROR
    expect(ackToStatus(1)).toBeNull();      // PENDING → ignora
    expect(ackToStatus(2)).toBe('SENT');    // SERVER_ACK
    expect(ackToStatus(3)).toBe('DELIVERED'); // DELIVERY_ACK
    expect(ackToStatus(4)).toBe('READ');    // READ
    expect(ackToStatus(5)).toBe('READ');    // PLAYED
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
  it('FAILED só antes de enviado (SENT confirmado não rebaixa)', () => {
    expect(statusPatch({ status: 'PENDING' }, 'FAILED', NOW)).toEqual({ status: 'FAILED', failedAt: NOW });
    expect(statusPatch({ status: 'SENT' }, 'FAILED', NOW)).toBeNull();
    expect(statusPatch({ status: 'DELIVERED' }, 'FAILED', NOW)).toBeNull();
    expect(statusPatch({ status: 'READ' }, 'FAILED', NOW)).toBeNull();
  });
  it('recuperação de FAILED limpa failedAt/errorMessage ao avançar', () => {
    const p = statusPatch({ status: 'FAILED', deliveredAt: null, readAt: null }, 'DELIVERED', NOW);
    expect(p).toEqual({ status: 'DELIVERED', deliveredAt: NOW, failedAt: null, errorMessage: null });
  });
});
