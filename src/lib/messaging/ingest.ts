// Ingestão da mensageria — única fonte de verdade para gravar conversas e
// mensagens de QUALQUER canal (webhook live, histórico, sync explícito).
//
// Garante (diretriz §4.3 e §4.4):
//  - 1 conversa por (contato, canal, conta de entrada);
//  - deduplicação por (accountId, externalId);
//  - etiqueta de procedência SEMPRE gravada: channel + accountId + source.
//    Não existe caminho neste módulo que insira mensagem sem procedência.
//
// O núcleo não conhece provedor: quem traduz payload de Evolution/Meta são os
// adapters em lib/messaging/adapters/.
import { Channel, MessageSource, MessageEntryPoint } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveContact } from './contacts';

// Tipos de mensagem reconhecidos (independente de canal).
export type MessageKind =
  | 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT'
  | 'STICKER' | 'LOCATION' | 'CONTACT' | 'UNSUPPORTED';

export function mediaPlaceholder(type: MessageKind): string {
  switch (type) {
    case 'IMAGE': return '📷 Imagem';
    case 'AUDIO': return '🎤 Áudio';
    case 'VIDEO': return '🎬 Vídeo';
    case 'DOCUMENT': return '📎 Documento';
    case 'STICKER': return '💬 Figurinha';
    case 'LOCATION': return '📍 Localização';
    case 'CONTACT': return '👤 Contato';
    default: return 'Mensagem não suportada';
  }
}

/** Procedência da mensagem — as três dimensões da etiqueta (diretriz §4.3). */
export interface Provenance {
  channel: Channel;
  /** Conta/número NOSSO onde a mensagem caiu. null = conta primária do canal. */
  accountId: string | null;
  source: MessageSource;
  entryPoint?: MessageEntryPoint | null;
  referral?: Record<string, unknown> | null;
}

interface ContactRef {
  /** Identidade no canal: telefone (WhatsApp), IGSID (Instagram), open_id (TikTok). */
  externalId: string;
  /**
   * Nome informado pelo canal. ATENÇÃO: no WhatsApp isso é o `pushName`, que é
   * o nome de QUEM ENVIOU. O ingest só o aceita como nome do contato quando a
   * procedência é CONTACT (mensagem recebida) — ver derivação abaixo.
   */
  name?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}

// Resolve a conversa única por (contato, canal, conta). Cria se não existir.
async function resolveConversation(opts: {
  companyId: string;
  channel: Channel;
  accountId: string | null;
  contactId: string;
  entryPoint?: MessageEntryPoint | null;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      companyId: opts.companyId,
      channel: opts.channel,
      contactId: opts.contactId,
      deletedAt: null,
    },
  });
  if (existing) {
    if (!existing.accountId && opts.accountId) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { accountId: opts.accountId },
      });
    }
    return existing;
  }
  return prisma.conversation.create({
    data: {
      companyId: opts.companyId,
      channel: opts.channel,
      accountId: opts.accountId,
      contactId: opts.contactId,
      entryPoint: opts.entryPoint ?? null,
    },
  });
}

// Direção derivada da procedência: só CONTACT entra; o resto sai.
function directionOf(source: MessageSource): 'INCOMING' | 'OUTGOING' {
  return source === MessageSource.CONTACT ? 'INCOMING' : 'OUTGOING';
}

async function isDuplicate(accountId: string | null, externalId?: string | null) {
  if (!externalId) return false;
  const exists = await prisma.message.findFirst({
    where: { accountId, externalId },
    select: { id: true },
  });
  return Boolean(exists);
}

// Atualiza o preview/não-lidas da conversa. `isHistory` evita inflar não-lidas
// e só avança o "último contato" quando a mensagem é mais recente.
async function touchConversation(opts: {
  conversationId: string;
  currentLastMessageAt: Date | null;
  content: string;
  when: Date;
  direction: 'INCOMING' | 'OUTGOING';
  isHistory?: boolean;
}) {
  const isNewer = !opts.currentLastMessageAt || opts.when >= opts.currentLastMessageAt;
  const data: Record<string, unknown> = {};
  if (!opts.isHistory || isNewer) {
    data.lastMessage = opts.content;
    data.lastMessageAt = opts.when;
  }
  if (!opts.isHistory && opts.direction === 'INCOMING') data.unreadCount = { increment: 1 };
  if (Object.keys(data).length) {
    await prisma.conversation.update({ where: { id: opts.conversationId }, data });
  }
}

export type IngestResult = 'created' | 'duplicate' | 'skipped' | 'placeholder';

/**
 * Grava UMA mensagem de texto/placeholder com deduplicação e procedência.
 */
export async function ingestMessage(opts: {
  companyId: string;
  provenance: Provenance;
  contact: ContactRef;
  text?: string;
  /** undefined = não informado (assume TEXT se houver texto); null = sem conteúdo utilizável. */
  messageKind?: MessageKind | null;
  externalId?: string | null;
  status?: string;
  createdAt?: Date;
  createdByUserId?: string | null;
  isHistory?: boolean;
}): Promise<IngestResult> {
  if (!opts.contact.externalId) return 'skipped';

  const { text } = opts;
  const kind: MessageKind | null =
    opts.messageKind !== undefined ? opts.messageKind : text ? 'TEXT' : null;

  // Conteúdo: texto quando existe; mídia sem texto vira placeholder controlado
  // (nunca descarta em silêncio); sem texto e sem tipo utilizável → skipped.
  let content: string;
  let effectiveKind: MessageKind;
  let isPlaceholder = false;
  if (text) {
    content = text;
    effectiveKind = kind && kind !== 'TEXT' ? kind : 'TEXT';
  } else if (kind && kind !== 'TEXT') {
    effectiveKind = kind;
    content = mediaPlaceholder(kind);
    isPlaceholder = true;
  } else {
    return 'skipped';
  }

  if (await isDuplicate(opts.provenance.accountId, opts.externalId)) return 'duplicate';

  const { contact } = await resolveContact({
    companyId: opts.companyId,
    channel: opts.provenance.channel,
    externalId: opts.contact.externalId,
    name: opts.contact.name,
    handle: opts.contact.handle,
    avatarUrl: opts.contact.avatarUrl,
    phone: opts.contact.phone,
    // Ponto único da regra: o nome do canal só vale como nome do CONTATO em
    // mensagem recebida. Em mensagem que a clínica mandou (CRM/MOBILE), o nome
    // que vem no payload é o do DONO do número — usá-lo batizaria todos os
    // contatos com o mesmo nome.
    nameIsFromContact: opts.provenance.source === MessageSource.CONTACT,
  });

  const conversation = await resolveConversation({
    companyId: opts.companyId,
    channel: opts.provenance.channel,
    accountId: opts.provenance.accountId,
    contactId: contact.id,
    entryPoint: opts.provenance.entryPoint,
  });

  const direction = directionOf(opts.provenance.source);
  // Mídia COM texto: o texto é legenda e fica também em `caption`.
  const caption = effectiveKind !== 'TEXT' && !isPlaceholder && text ? text : null;

  try {
    await prisma.message.create({
      data: {
        companyId: opts.companyId,
        conversationId: conversation.id,
        // --- etiqueta de procedência (obrigatória) ---
        channel: opts.provenance.channel,
        accountId: conversation.accountId ?? opts.provenance.accountId,
        source: opts.provenance.source,
        entryPoint: opts.provenance.entryPoint ?? null,
        referral: (opts.provenance.referral ?? undefined) as never,
        // ---
        externalId: opts.externalId ?? null,
        content,
        messageType: effectiveKind,
        caption,
        direction,
        status: opts.status ?? (direction === 'OUTGOING' ? 'SENT' : 'RECEIVED'),
        createdByUserId: opts.createdByUserId ?? null,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
  } catch {
    // Corrida no índice único (accountId, externalId) — outra entrega gravou primeiro.
    return 'duplicate';
  }

  await touchConversation({
    conversationId: conversation.id,
    currentLastMessageAt: conversation.lastMessageAt,
    content,
    when: opts.createdAt ?? new Date(),
    direction,
    isHistory: opts.isHistory,
  });

  return isPlaceholder ? 'placeholder' : 'created';
}

/**
 * Ingestão de mídia recebida. Cria a mensagem com mediaStatus PENDING e devolve
 * o registro — o adapter então baixa o arquivo, cria o anexo e marca
 * AVAILABLE/FAILED. Se o download falhar, a mensagem PERMANECE (não some).
 */
export async function ingestInboundMedia(opts: {
  companyId: string;
  provenance: Provenance;
  contact: ContactRef;
  messageKind: MessageKind;
  caption?: string | null;
  externalId?: string | null;
  createdAt?: Date;
}): Promise<{ status: IngestResult; messageId: string | null; conversationId: string | null }> {
  const empty = { status: 'skipped' as IngestResult, messageId: null, conversationId: null };
  if (!opts.contact.externalId) return empty;

  if (await isDuplicate(opts.provenance.accountId, opts.externalId)) {
    return { status: 'duplicate', messageId: null, conversationId: null };
  }

  const { contact } = await resolveContact({
    companyId: opts.companyId,
    channel: opts.provenance.channel,
    externalId: opts.contact.externalId,
    name: opts.contact.name,
    handle: opts.contact.handle,
    avatarUrl: opts.contact.avatarUrl,
    phone: opts.contact.phone,
    // Ponto único da regra: o nome do canal só vale como nome do CONTATO em
    // mensagem recebida. Em mensagem que a clínica mandou (CRM/MOBILE), o nome
    // que vem no payload é o do DONO do número — usá-lo batizaria todos os
    // contatos com o mesmo nome.
    nameIsFromContact: opts.provenance.source === MessageSource.CONTACT,
  });

  const conversation = await resolveConversation({
    companyId: opts.companyId,
    channel: opts.provenance.channel,
    accountId: opts.provenance.accountId,
    contactId: contact.id,
    entryPoint: opts.provenance.entryPoint,
  });

  const direction = directionOf(opts.provenance.source);
  const caption = opts.caption && opts.caption.trim() ? opts.caption : null;
  const content = caption ?? mediaPlaceholder(opts.messageKind);

  let created;
  try {
    created = await prisma.message.create({
      data: {
        companyId: opts.companyId,
        conversationId: conversation.id,
        channel: opts.provenance.channel,
        accountId: conversation.accountId ?? opts.provenance.accountId,
        source: opts.provenance.source,
        entryPoint: opts.provenance.entryPoint ?? null,
        referral: (opts.provenance.referral ?? undefined) as never,
        externalId: opts.externalId ?? null,
        content,
        messageType: opts.messageKind,
        caption,
        direction,
        status: 'RECEIVED',
        mediaStatus: 'PENDING',
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
  } catch {
    return { status: 'duplicate', messageId: null, conversationId: null };
  }

  await touchConversation({
    conversationId: conversation.id,
    currentLastMessageAt: conversation.lastMessageAt,
    content,
    when: opts.createdAt ?? new Date(),
    direction,
  });

  return { status: 'created', messageId: created.id, conversationId: conversation.id };
}

/**
 * Importa uma thread sem mensagem (sync de histórico, CHATS_SET). Cria contato e
 * conversa, e opcionalmente semeia o preview da última mensagem.
 */
export async function upsertConversationThread(opts: {
  companyId: string;
  channel: Channel;
  accountId: string | null;
  contact: ContactRef;
  /**
   * O `contact.name` é o nome DESTE contato (e não o do dono do número). Em
   * eventos de chat o campo certo é o nome do chat — nunca o pushName de uma
   * mensagem enviada pela clínica.
   */
  nameIsFromContact?: boolean;
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
}): Promise<'created' | 'updated'> {
  const { contact } = await resolveContact({
    companyId: opts.companyId,
    channel: opts.channel,
    externalId: opts.contact.externalId,
    name: opts.contact.name,
    handle: opts.contact.handle,
    avatarUrl: opts.contact.avatarUrl,
    phone: opts.contact.phone,
    nameIsFromContact: opts.nameIsFromContact ?? false,
  });

  const existing = await prisma.conversation.findFirst({
    where: { companyId: opts.companyId, channel: opts.channel, contactId: contact.id, deletedAt: null },
  });

  if (!existing) {
    await prisma.conversation.create({
      data: {
        companyId: opts.companyId,
        channel: opts.channel,
        accountId: opts.accountId,
        contactId: contact.id,
        lastMessage: opts.lastMessage ?? null,
        lastMessageAt: opts.lastMessageAt ?? null,
      },
    });
    return 'created';
  }

  const patch: Record<string, unknown> = {};
  if (!existing.accountId && opts.accountId) patch.accountId = opts.accountId;
  if (
    opts.lastMessage &&
    opts.lastMessageAt &&
    (!existing.lastMessageAt || opts.lastMessageAt > existing.lastMessageAt)
  ) {
    patch.lastMessage = opts.lastMessage;
    patch.lastMessageAt = opts.lastMessageAt;
  }
  if (Object.keys(patch).length) {
    await prisma.conversation.update({ where: { id: existing.id }, data: patch });
  }
  return 'updated';
}

/**
 * Atualiza nome/foto de um contato (CONTACTS_SET) sem criar conversa.
 * Diferente do antigo `upsertContact`, funciona mesmo sem thread aberta — o
 * contato existe por si, não como campo da conversa.
 */
export async function upsertContactProfile(opts: {
  companyId: string;
  channel: Channel;
  externalId: string;
  name?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  /** Só quando o canal informa um telefone DE VERDADE (nunca um `@lid`). */
  phone?: string | null;
}) {
  await resolveContact({
    companyId: opts.companyId,
    channel: opts.channel,
    externalId: opts.externalId,
    name: opts.name,
    handle: opts.handle,
    avatarUrl: opts.avatarUrl,
    phone: opts.phone,
    // Evento de contato é POR CONTATO: cada registro traz o nome do próprio
    // contato, então aqui o nome é confiável.
    nameIsFromContact: true,
  });
}
