// Conversão conversa → agendamento (diretriz §5).
//
// Cobre o que quebra em silêncio: origem do paciente derivada do canal (se virar
// escolha manual, o relatório de origem mente), formato do CPF (formato
// divergente = paciente duplicado, porque a unicidade é por string) e o casamento
// do telefone com DDI (se comparar a string inteira, nunca casa e a recepção
// recadastra quem já é paciente).
import { describe, it, expect } from 'vitest';
import { Channel, PatientOrigin } from '@prisma/client';
import {
  normalizeCpf,
  onlyDigits,
  patientOriginFor,
  phoneMatchTail,
  suggestSlot,
} from '@/lib/messaging/scheduling';

describe('origem do paciente derivada do canal', () => {
  it('WhatsApp entra como WHATSAPP', () => {
    expect(patientOriginFor(Channel.WHATSAPP)).toBe(PatientOrigin.WHATSAPP);
  });

  it('Instagram entra como INSTAGRAM', () => {
    expect(patientOriginFor(Channel.INSTAGRAM)).toBe(PatientOrigin.INSTAGRAM);
  });

  it('TikTok cai em OTHER (não existe no enum de origem do paciente)', () => {
    expect(patientOriginFor(Channel.TIKTOK)).toBe(PatientOrigin.OTHER);
  });
});

describe('CPF gravado no formato do módulo de Pacientes', () => {
  it('mascara 11 dígitos crus', () => {
    expect(normalizeCpf('12345678900')).toBe('123.456.789-00');
  });

  it('mantém o valor já mascarado idêntico', () => {
    expect(normalizeCpf('123.456.789-00')).toBe('123.456.789-00');
  });

  it('não inventa máscara para entrada incompleta', () => {
    expect(normalizeCpf('1234')).toBe('1234');
  });

  it('onlyDigits limpa qualquer pontuação', () => {
    expect(onlyDigits('(11) 99999-8888')).toBe('11999998888');
    expect(onlyDigits(null)).toBe('');
  });
});

describe('casamento de telefone entre conversa e cadastro', () => {
  it('usa os 8 últimos dígitos, ignorando DDI e DDD', () => {
    expect(phoneMatchTail('5511999998888')).toBe('99998888');
    expect(phoneMatchTail('11999998888')).toBe('99998888');
  });

  it('mesmo sufixo para número com e sem DDI — é o que faz o match funcionar', () => {
    expect(phoneMatchTail('5511999998888')).toBe(phoneMatchTail('(11) 99999-8888'));
  });

  it('devolve null quando não há 8 dígitos (não sugere paciente no escuro)', () => {
    expect(phoneMatchTail('9999')).toBeNull();
    expect(phoneMatchTail('')).toBeNull();
    expect(phoneMatchTail(null)).toBeNull();
  });
});

describe('horário sugerido', () => {
  it('cai sempre em :00 ou :30', () => {
    for (const minuto of [0, 7, 15, 29, 30, 31, 44, 59]) {
      const base = new Date(2026, 7, 17, 10, minuto, 0, 0);
      const { time } = suggestSlot(base);
      expect(['00', '30']).toContain(time.slice(3, 5));
    }
  });

  it('está pelo menos 30 minutos à frente', () => {
    const base = new Date(2026, 7, 17, 10, 0, 0, 0);
    const { date, time } = suggestSlot(base);
    const sugerido = new Date(`${date}T${time}:00`);
    expect(sugerido.getTime() - base.getTime()).toBeGreaterThanOrEqual(30 * 60000);
  });

  it('vira o dia quando o expediente acaba perto da meia-noite', () => {
    const base = new Date(2026, 7, 17, 23, 45, 0, 0);
    const { date } = suggestSlot(base);
    expect(date).toBe('2026-08-18');
  });
});
