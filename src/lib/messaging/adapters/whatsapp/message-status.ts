// Mapeia os ACKs de status do WhatsApp (evento messages.update) para o nosso status.
// Vocabulário CONFIRMADO ao vivo na Evolution v2.3.7 (campo MessageUpdate):
//   SERVER_ACK (enviado) · DELIVERY_ACK (entregue) · READ (lido) · PLAYED (áudio ouvido).
// Fallback numérico: a Evolution roda WHATSAPP-BAILEYS, cujo messages.update carrega o
// enum proto WebMessageInfo.Status — os MESMOS nomes acima. Por isso o mapa numérico segue
// o enum proto (2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED), NÃO o esquema
// whatsapp-web.js (1=sent…). Manter consistente com os nomes string evita tick azul falso.
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
    // Enum proto WebMessageInfo.Status (Baileys/Evolution): 0=ERROR, 1=PENDING,
    // 2=SERVER_ACK (enviado), 3=DELIVERY_ACK (entregue), 4=READ, 5=PLAYED.
    // Extra: -1 (erro estilo whatsapp-web.js) também → FAILED, defensivo.
    // PENDING (1) é ignorado; ERROR (0/-1) só marca falha antes de enviado (ver statusPatch).
    return ({ [-1]: 'FAILED', 0: 'FAILED', 1: null, 2: 'SENT', 3: 'DELIVERED', 4: 'READ', 5: 'READ' } as Record<number, MsgStatus | null>)[n] ?? null;
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
    // Só marca falha ENQUANTO a mensagem ainda não foi aceita (SENT reflete envio
    // confirmado pela Evolution). Um ACK de erro que chega DEPOIS de enviado/entregue/
    // lido é espúrio e NÃO rebaixa o status já alcançado.
    if (cur >= STATUS_RANK.SENT) return null;
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
  // Recuperação: se estava FAILED e agora avançou, limpa a marca de falha p/ não ficar
  // entregue/lido E com failedAt/errorMessage preenchidos ao mesmo tempo.
  if (current.status === 'FAILED') {
    patch.failedAt = null;
    patch.errorMessage = null;
  }
  return patch;
}
