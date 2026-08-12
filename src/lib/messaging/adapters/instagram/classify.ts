// Tradução do payload de webhook do Instagram para o vocabulário do núcleo.
//
// O adapter é o único que entende este formato (diretriz regra 2). Sai daqui
// MessageKind + procedência; entra no ingest como qualquer outro canal.
import { MessageEntryPoint } from '@prisma/client';
import type { MessageKind } from '@/lib/messaging/ingest';

/** Uma mensagem já normalizada, pronta para o ingest. */
export interface InstagramInbound {
  /** IGSID de quem enviou — é a identidade do contato no canal. */
  senderId: string;
  /** IGSID da conta que RECEBEU (a da clínica). */
  recipientId: string;
  externalId: string | null;
  text?: string;
  kind: MessageKind | null;
  createdAt?: Date;
  entryPoint: MessageEntryPoint | null;
  referral: Record<string, unknown> | null;
  /** Eco da nossa própria mensagem: a Meta reentrega o que a Página enviou. */
  isEcho: boolean;
}

function classifyAttachments(atts: any[]): MessageKind | null {
  if (!atts?.length) return null;
  const type = String(atts[0]?.type || '').toLowerCase();
  if (type === 'image') return 'IMAGE';
  if (type === 'audio') return 'AUDIO';
  if (type === 'video') return 'VIDEO';
  if (type === 'file') return 'DOCUMENT';
  if (type === 'share' || type === 'story_mention') return 'IMAGE';
  if (type === 'location') return 'LOCATION';
  return 'UNSUPPORTED';
}

/**
 * De onde a conversa veio, quando a Meta informa. É o que permite responder
 * "esse paciente veio do anúncio ou do orgânico?" (§4.3) e alimenta o
 * DealSource na conversão.
 */
function classifyEntryPoint(messaging: any): { entryPoint: MessageEntryPoint | null; referral: Record<string, unknown> | null } {
  const ref = messaging?.referral || messaging?.postback?.referral;
  if (ref) {
    const source = String(ref.source || '').toUpperCase();
    // ADS = clique em anúncio; IG_ME/SHORTLINK = link do perfil/bio.
    const entryPoint = source.includes('AD') ? MessageEntryPoint.AD : MessageEntryPoint.PROFILE_LINK;
    return {
      entryPoint,
      // Guarda só o essencial, sanitizado — nunca o payload cru completo.
      referral: {
        source: ref.source ?? null,
        type: ref.type ?? null,
        adId: ref.ad_id ?? null,
        refCode: typeof ref.ref === 'string' ? ref.ref.slice(0, 120) : null,
      },
    };
  }

  const atts: any[] = messaging?.message?.attachments || [];
  if (atts.some((a) => String(a?.type).toLowerCase() === 'story_mention')) {
    return { entryPoint: MessageEntryPoint.STORY_REPLY, referral: null };
  }
  if (messaging?.message?.reply_to?.story) {
    return { entryPoint: MessageEntryPoint.STORY_REPLY, referral: null };
  }
  return { entryPoint: MessageEntryPoint.DIRECT, referral: null };
}

/**
 * Achata o corpo do webhook (entry[].messaging[]) numa lista de mensagens.
 * Ignora eventos sem conteúdo utilizável (read, reaction, delivery).
 */
export function parseInstagramWebhook(body: any): InstagramInbound[] {
  const out: InstagramInbound[] = [];
  const entries: any[] = body?.entry || [];

  for (const entry of entries) {
    const events: any[] = entry?.messaging || entry?.changes?.map((c: any) => c?.value) || [];
    for (const ev of events) {
      const msg = ev?.message;
      // read/delivery/reaction não são mensagem — descarta sem erro.
      if (!msg || msg.is_deleted) continue;
      // Reação não vira mensagem na thread.
      if (ev?.reaction) continue;

      const text: string | undefined = typeof msg.text === 'string' && msg.text ? msg.text : undefined;
      const kindFromAtts = classifyAttachments(msg.attachments);
      const kind: MessageKind | null = text ? 'TEXT' : kindFromAtts;
      if (!text && !kind) continue;

      const { entryPoint, referral } = classifyEntryPoint(ev);

      out.push({
        senderId: String(ev?.sender?.id || ''),
        recipientId: String(ev?.recipient?.id || ''),
        externalId: msg.mid ? String(msg.mid) : null,
        text,
        kind,
        createdAt: ev?.timestamp ? new Date(Number(ev.timestamp)) : undefined,
        entryPoint,
        referral,
        isEcho: msg.is_echo === true,
      });
    }
  }

  return out.filter((m) => m.senderId && m.recipientId);
}
