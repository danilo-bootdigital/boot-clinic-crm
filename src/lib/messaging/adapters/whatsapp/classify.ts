// Classificação de payload do WhatsApp (Evolution/Baileys) — específico do canal.
// O núcleo da mensageria (lib/messaging/ingest.ts) não conhece este formato: o
// adapter traduz para MessageKind antes de chamar o ingest (diretriz regra 2).
import type { MessageKind } from '@/lib/messaging/ingest';

// Extrai o texto de um objeto `message` do WhatsApp (cobre os tipos comuns).
export function extractText(m: any): string | undefined {
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    undefined
  );
}

// Classifica um objeto `message` do WhatsApp. null = sem conteúdo utilizável
// (reação/presence/protocolo) — pode ser ignorado.
export function classifyMessage(m: any): MessageKind | null {
  if (!m || typeof m !== 'object') return null;
  if (m.conversation || m.extendedTextMessage) return 'TEXT';
  if (m.imageMessage) return 'IMAGE';
  if (m.audioMessage) return 'AUDIO';
  if (m.videoMessage) return 'VIDEO';
  if (m.documentMessage || m.documentWithCaptionMessage) return 'DOCUMENT';
  if (m.stickerMessage) return 'STICKER';
  if (m.locationMessage || m.liveLocationMessage) return 'LOCATION';
  if (m.contactMessage || m.contactsArrayMessage) return 'CONTACT';
  // Só protocolo/reação/efêmero → sem conteúdo utilizável.
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage) return null;
  // Chegou algo com estrutura mas de tipo não mapeado.
  return 'UNSUPPORTED';
}

// Parte local do jid, sem o sufixo de device ("...:12").
function jidLocalPart(jid?: string | null): string | undefined {
  if (!jid) return undefined;
  return jid.split('@')[0]?.split(':')[0] || undefined;
}

/**
 * IDENTIDADE do contato no canal. Serve para qualquer domínio de jid, inclusive
 * `@lid` — o identificador de privacidade que o WhatsApp passou a usar e que
 * NÃO é um telefone.
 */
export function jidToExternalId(jid?: string | null): string | undefined {
  return jidLocalPart(jid);
}

/**
 * Telefone que ACOMPANHA um remetente `@lid`, quando o provedor o envia.
 *
 * Isto é o que permite unificar: a conversa chega chaveada pelo lid, mas o nome
 * do contato veio pelo telefone (findContacts). Com o telefone em mãos, o
 * resolveContact anexa a identidade lid ao contato que JÁ tem nome, em vez de
 * criar um segundo contato anônimo.
 *
 * Os nomes de campo são DEFENSIVOS: variam entre versões de Baileys/Evolution
 * (`senderPn`, `remoteJidAlt`, `participantPn`). Não observei o payload real —
 * se nenhum vier, a função devolve undefined e nada piora.
 */
export function altPhoneFromKey(key: any): string | undefined {
  if (!key || typeof key !== 'object') return undefined;
  const candidatos = [key.senderPn, key.remoteJidAlt, key.participantPn, key.participantAlt];
  for (const c of candidatos) {
    const phone = jidToPhone(typeof c === 'string' ? c : undefined);
    if (phone) return phone;
  }
  return undefined;
}

/**
 * TELEFONE, e só quando o jid realmente carrega um.
 *
 * `@lid` é identidade opaca, não número: gravá-la como telefone enche o cadastro
 * de "telefones" de 15 dígitos e, pior, o casamento de contato por sufixo de
 * telefone poderia unir duas pessoas diferentes.
 */
export function jidToPhone(jid?: string | null): string | undefined {
  if (!jid) return undefined;
  const domain = jid.split('@')[1] ?? '';
  const isPhoneDomain = domain === 's.whatsapp.net' || domain === 'c.us' || domain === '';
  if (!isPhoneDomain) return undefined;
  return jidLocalPart(jid);
}
