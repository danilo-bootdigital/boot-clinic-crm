// Mapeia os ACKs de status do WhatsApp (evento messages.update) para o nosso status.
// Vocabulário CONFIRMADO ao vivo na Evolution v2.3.7 (campo MessageUpdate):
//   SERVER_ACK (enviado) · DELIVERY_ACK (entregue) · READ (lido) · PLAYED (áudio ouvido).
// Também aceita ACK numérico do Baileys (1=sent,2=delivered,3=read,4=played) por robustez.
// Puro/sem I/O → testável.

export type MsgStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

// Rank para NUNCA rebaixar status (entregue não volta p/ enviado; lido não volta p/ entregue).
export const STATUS_RANK: Record<string, number> = { PENDING: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

// Converte o valor cru do ACK (string ou número) no nosso status. null = ignorar.
export function ackToStatus(raw: unknown): MsgStatus | null {
  if (raw == null) return null;
  const s = String(raw).toUpperCase().trim();
  const byName: Record<string, MsgStatus | null> = {
    SERVER_ACK: 'SENT', SENT: 'SENT',
    DELIVERY_ACK: 'DELIVERED', DELIVERED: 'DELIVERED',
    READ: 'READ', READ_ACK: 'READ', PLAYED: 'READ',
    ERROR: 'FAILED',
    PENDING: null, PENDING_ACK: null, INACTIVE: null,
  };
  if (s in byName) return byName[s];
  const n = Number(raw);
  if (!Number.isNaN(n)) {
    // 0 é ambíguo (pendente/erro) → ignora p/ não marcar falha indevida.
    return ({ 1: 'SENT', 2: 'DELIVERED', 3: 'READ', 4: 'READ' } as Record<number, MsgStatus>)[n] ?? null;
  }
  return null;
}

// Calcula o patch de atualização (ou null se nada muda / seria rebaixamento).
// `now` é injetado para ser determinístico em teste.
export function statusPatch(
  current: { status: string; deliveredAt?: Date | null; readAt?: Date | null },
  next: MsgStatus,
  now: Date,
): Record<string, any> | null {
  const cur = STATUS_RANK[current.status] ?? 0;

  if (next === 'FAILED') {
    // Só marca falha se ainda não avançou para entregue/lido.
    if (cur >= STATUS_RANK.DELIVERED) return null;
    if (current.status === 'FAILED') return null;
    return { status: 'FAILED', failedAt: now };
  }

  if (STATUS_RANK[next] <= cur) return null; // não rebaixa nem repete

  const patch: Record<string, any> = { status: next };
  if (next === 'DELIVERED') patch.deliveredAt = current.deliveredAt ?? now;
  if (next === 'READ') {
    patch.readAt = current.readAt ?? now;
    patch.deliveredAt = current.deliveredAt ?? now; // lido implica entregue
  }
  return patch;
}
