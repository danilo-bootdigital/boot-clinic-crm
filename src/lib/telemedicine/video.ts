import { randomBytes, randomUUID } from 'crypto';

// Provider de vídeo AGNÓSTICO. Nesta entrega geramos uma URL de sala (Jitsi por
// URL — zero dependência/custo). Trocar de provider (Daily/Twilio/self-host) é
// só alterar buildRoomUrl + a env; o restante do módulo não muda.

export type VideoProvider = 'JITSI' | 'DAILY' | 'TWILIO' | 'CUSTOM';

export function videoProvider(): VideoProvider {
  return (process.env.TELEMEDICINE_PROVIDER as VideoProvider) || 'JITSI';
}

function jitsiBase(): string {
  return (process.env.TELEMEDICINE_JITSI_BASE || 'https://meet.jit.si').replace(/\/$/, '');
}

// Base pública do app (p/ montar o link do paciente enviado por WhatsApp).
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

// Identificador opaco e imprevisível da sala (não sequencial, não adivinhável).
export function generateRoomKey(): string {
  return `bcc-${randomBytes(16).toString('hex')}`;
}

// Slug do link público do paciente: /tele/[slug].
export function generatePublicSlug(): string {
  return randomBytes(12).toString('base64url');
}

// Token temporário de acesso à sala (paciente). Curto, único, expira.
export function generateAccessToken(): string {
  return `${randomUUID().replace(/-/g, '')}${randomBytes(8).toString('hex')}`;
}

// URL da sala de vídeo segundo o provider. Jitsi: base/roomKey.
export function buildRoomUrl(roomKey: string): string {
  switch (videoProvider()) {
    case 'JITSI':
    default:
      return `${jitsiBase()}/${roomKey}`;
  }
}

// Link público que o paciente recebe (abre /tele/[slug], faz consentimento e entra).
export function buildPatientLink(publicSlug: string): string {
  return `${appBaseUrl()}/tele/${publicSlug}`;
}

// Validade padrão do token do paciente: da criação até 6h após o horário marcado.
export function defaultTokenExpiry(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() + 6 * 60 * 60 * 1000);
}
