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

/**
 * METADADOS DE MÍDIA declarados pelo WhatsApp no próprio payload.
 *
 * Por que isto existe: o container de áudio de nota de voz (Ogg/Opus gravado em
 * fluxo pelo aplicativo) frequentemente chega SEM duração utilizável no último
 * page do Ogg. O `<audio>` do navegador então reporta duração `Infinity` ou um
 * valor curto e errado — e a reprodução termina antes do fim do conteúdo. O
 * WhatsApp, por outro lado, declara `seconds` no payload: essa é a duração
 * AUTORITATIVA, e é ela que a interface deve usar.
 *
 * `fileLength` e `fileSha256` servem à integridade: se os bytes baixados não
 * batem com o que o provedor declarou, o download veio truncado — e áudio
 * truncado é exatamente o sintoma de "toca alguns segundos e para".
 */
export interface InboundMediaMeta {
  durationSeconds?: number;
  width?: number;
  height?: number;
  declaredBytes?: number;
  sha256Base64?: string;
}

// Números do Baileys chegam como number, string ou Long ({low, high, unsigned})
// dependendo da versão/serialização do webhook. Normaliza os três casos.
function toPositiveInt(v: unknown): number | undefined {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'bigint') n = Number(v);
  else if (typeof v === 'string') n = Number(v);
  else if (v && typeof v === 'object' && typeof (v as any).low === 'number') {
    const { low, high } = v as { low: number; high?: number };
    n = (high ? high * 4294967296 : 0) + (low >>> 0);
  } else return undefined;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

// O nó de mídia dentro de um objeto `message` do WhatsApp (o mesmo que
// classifyMessage inspeciona). Retorna {} quando a mensagem não tem mídia.
function mediaNode(m: any): any | null {
  if (!m || typeof m !== 'object') return null;
  return (
    m.audioMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.documentMessage ||
    m.documentWithCaptionMessage?.message?.documentMessage ||
    null
  );
}

export function extractMediaMeta(m: any): InboundMediaMeta {
  const node = mediaNode(m);
  if (!node) return {};
  return {
    durationSeconds: toPositiveInt(node.seconds),
    width: toPositiveInt(node.width),
    height: toPositiveInt(node.height),
    declaredBytes: toPositiveInt(node.fileLength),
    // Só a forma string (base64) é utilizável; Uint8Array serializado vira
    // objeto indexado e não vale a pena reconstruir só para um aviso de log.
    sha256Base64: typeof node.fileSha256 === 'string' ? node.fileSha256 : undefined,
  };
}
