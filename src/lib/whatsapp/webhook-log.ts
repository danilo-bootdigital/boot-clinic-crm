import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

// Observabilidade + segurança do webhook. NUNCA persiste payload cru (LGPD): só
// hash + metadados essenciais. Best-effort — log nunca derruba o processamento.

export function hashPayload(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function newCorrelationId(): string {
  return randomUUID();
}

// Comparação de tokens em tempo constante (compara hashes de tamanho fixo p/ não
// vazar comprimento). Usada no segredo opcional do webhook.
export function safeEqualToken(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  try {
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

export type WebhookStatus = 'PROCESSED' | 'SKIPPED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';

export interface WebhookEventLog {
  companyId?: string | null;
  instanceId?: string | null;
  eventType: string;
  messageType?: string | null;
  externalId?: string | null;
  status: WebhookStatus;
  payloadHash?: string | null;
  correlationId?: string | null;
  errorMessage?: string | null;
}

// Grava um evento de webhook (metadados). Silencioso em falha para não afetar a resposta.
export async function logWebhookEvent(e: WebhookEventLog): Promise<void> {
  try {
    await prisma.whatsAppWebhookEvent.create({
      data: {
        companyId: e.companyId ?? null,
        instanceId: e.instanceId ?? null,
        eventType: e.eventType || 'unknown',
        messageType: e.messageType ?? null,
        externalId: e.externalId ?? null,
        status: e.status,
        payloadHash: e.payloadHash ?? null,
        correlationId: e.correlationId ?? null,
        // Garante que só mensagem sanitizada (curta) seja gravada — nunca payload/segredo.
        errorMessage: e.errorMessage ? String(e.errorMessage).slice(0, 300) : null,
      },
    });
  } catch (err) {
    console.error('[whatsapp-webhook] falha ao gravar evento de observabilidade:', err);
  }
}
