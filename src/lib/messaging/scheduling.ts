// Regras puras da conversão conversa → agendamento (diretriz §5).
//
// Vive em lib/ pelo mesmo motivo de conversion.ts: arquivo de rota do Next só
// pode exportar nomes que ele reconhece (GET, POST, dynamic…), então helper
// exportado de lá quebra o build. E aqui elas ficam testáveis sem banco.
import { Channel, PatientOrigin } from '@prisma/client';

/**
 * Origem do paciente derivada do canal — não é escolha do usuário.
 *
 * Mesma regra do DealSource: quem chegou pelo WhatsApp nasce WHATSAPP. Se
 * virasse select manual, o relatório de origem passaria a depender de alguém
 * lembrar de marcar a opção certa.
 */
export function patientOriginFor(channel: Channel): PatientOrigin {
  if (channel === Channel.WHATSAPP) return PatientOrigin.WHATSAPP;
  if (channel === Channel.INSTAGRAM) return PatientOrigin.INSTAGRAM;
  // TikTok não existe no enum de origem do paciente — cai em OTHER.
  return PatientOrigin.OTHER;
}

export const onlyDigits = (v?: string | null) => (v || '').replace(/\D/g, '');

/**
 * CPF sempre gravado mascarado (123.456.789-00) — é o formato que o módulo de
 * Pacientes grava, e a unicidade é por string: misturar formatos criaria dois
 * cadastros para o mesmo CPF na mesma clínica.
 */
export function normalizeCpf(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 11) return raw.trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Sufixo usado para casar o telefone da conversa com o cadastro do paciente.
 *
 * Compara os 8 últimos dígitos porque o número que chega do WhatsApp vem com
 * DDI (55…) e o cadastro do paciente costuma estar sem — comparar a string
 * inteira nunca casaria. Devolve null quando não há dígitos suficientes, e aí
 * NÃO se sugere paciente nenhum (melhor pedir confirmação que casar errado).
 */
export function phoneMatchTail(phone?: string | null): string | null {
  const tail = onlyDigits(phone).slice(-8);
  return tail.length === 8 ? tail : null;
}

/**
 * Horário sugerido: próximo :00 ou :30 daqui a pelo menos 30 minutos. É palpite
 * de conveniência para o campo já vir preenchido — o atendente sempre ajusta.
 */
export function suggestSlot(now: Date = new Date()): { date: string; time: string } {
  const d = new Date(now.getTime() + 30 * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
