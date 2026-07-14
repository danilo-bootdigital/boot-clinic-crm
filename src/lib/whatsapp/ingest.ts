// Ingestão omnichannel de WhatsApp — única fonte de verdade para gravar conversas e
// mensagens a partir de QUALQUER origem (webhook live, history *_SET, sync explícito).
// Garante: 1 conversa por número/instância, deduplicação por (instanceId, externalId),
// e origem (source) consistente. Reusado pelo webhook e pela rota de sync — sem duplicar.

import { prisma } from '@/lib/db/prisma';

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

// Tipos de mensagem reconhecidos (usado para não descartar mídia silenciosamente).
export type WaMessageType =
  | 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT'
  | 'STICKER' | 'LOCATION' | 'CONTACT' | 'UNSUPPORTED';

// Classifica um objeto `message` do WhatsApp. Retorna null quando não há conteúdo
// utilizável (ex.: reação/presence/protocolo) — esse caso pode ser ignorado.
export function classifyMessage(m: any): WaMessageType | null {
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

// Placeholder INTERNO e controlado (PT-BR, sem payload) para mídia ainda não baixada.
// A coluna messageType guarda o tipo real para a futura UI renderizar corretamente.
export function mediaPlaceholder(type: WaMessageType): string {
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

// remoteJid → número (ignora sufixo de device "...:12"). Grupos (@g.us) retornam o id cru.
export function jidToPhone(jid?: string | null): string | undefined {
  if (!jid) return undefined;
  return jid.split('@')[0]?.split(':')[0] || undefined;
}

// Resolve a conversa ÚNICA por número dentro da empresa/instância (cria se não existir).
// Atualiza nome/foto/instância de forma idempotente, sem sobrescrever dados melhores.
async function resolveConversation(opts: {
  companyId: string;
  instanceId: string | null;
  phone: string;
  name?: string | null;
  avatar?: string | null;
}) {
  const digits = opts.phone.replace(/\D/g, '');
  let conv = await prisma.whatsAppConversation.findFirst({
    where: { companyId: opts.companyId, contactPhone: { contains: digits.slice(-8) }, deletedAt: null },
  });
  if (!conv) {
    return prisma.whatsAppConversation.create({
      data: {
        companyId: opts.companyId,
        instanceId: opts.instanceId,
        contactName: opts.name || opts.phone,
        contactPhone: opts.phone,
        contactAvatar: opts.avatar ?? null,
      },
    });
  }
  const patch: Record<string, any> = {};
  if (!conv.instanceId && opts.instanceId) patch.instanceId = opts.instanceId;
  if (opts.avatar && !conv.contactAvatar) patch.contactAvatar = opts.avatar;
  // Promove o nome real quando hoje só temos o número como nome.
  if (opts.name && conv.contactName === conv.contactPhone && opts.name !== conv.contactPhone) patch.contactName = opts.name;
  if (Object.keys(patch).length) conv = await prisma.whatsAppConversation.update({ where: { id: conv.id }, data: patch });
  return conv;
}

export type IngestResult = 'created' | 'duplicate' | 'skipped' | 'placeholder';

// Grava UMA mensagem com deduplicação. `fromMe` define direção/origem:
//  - fromMe=false → INCOMING / source=CONTACT (mensagem do paciente)
//  - fromMe=true  → OUTGOING / source=MOBILE (enviada pelo celular). O echo do que o CRM
//    enviou também volta como fromMe=true, mas casa pelo externalId e é deduplicado.
// `isHistory` evita inflar não-lidas e só avança o "último contato" se for mais recente.
export async function ingestMessage(opts: {
  companyId: string;
  instanceId: string | null;
  phone: string;
  name?: string | null;
  text?: string;
  messageType?: WaMessageType | null; // tipo classificado (TEXT default quando há texto)
  externalId?: string | null;
  fromMe: boolean;
  status?: string;
  createdAt?: Date;
  isHistory?: boolean;
}): Promise<IngestResult> {
  if (!opts.phone) return 'skipped';

  const text = opts.text;
  // messageType: undefined = não informado (callers antigos); null = classificado
  // como SEM conteúdo utilizável (reação/presence/protocolo) → ignora.
  const type: WaMessageType | null =
    opts.messageType !== undefined ? opts.messageType : text ? 'TEXT' : null;

  // Resolução de conteúdo:
  //  - texto (ou legenda) presente → usa o texto;
  //  - mídia SEM texto → placeholder controlado (NÃO descarta silenciosamente);
  //  - sem texto e sem tipo utilizável → 'skipped'.
  let content: string;
  let effectiveType: WaMessageType;
  let isPlaceholder = false;
  if (text) {
    content = text;
    effectiveType = type && type !== 'TEXT' ? type : 'TEXT';
  } else if (type && type !== 'TEXT') {
    effectiveType = type;
    content = mediaPlaceholder(type);
    isPlaceholder = true;
  } else {
    return 'skipped';
  }

  if (opts.externalId) {
    const exists = await prisma.whatsAppMessage.findFirst({
      where: { instanceId: opts.instanceId, externalId: opts.externalId },
      select: { id: true },
    });
    if (exists) return 'duplicate';
  }

  const conv = await resolveConversation({ companyId: opts.companyId, instanceId: opts.instanceId, phone: opts.phone, name: opts.name });
  const direction = opts.fromMe ? 'OUTGOING' : 'INCOMING';
  const source = opts.fromMe ? 'MOBILE' : 'CONTACT';
  // Legenda: quando é mídia COM texto, o texto é a legenda (fica também em `caption`).
  const caption = effectiveType !== 'TEXT' && !isPlaceholder && text ? text : null;

  try {
    await prisma.whatsAppMessage.create({
      data: {
        companyId: opts.companyId,
        conversationId: conv.id,
        instanceId: conv.instanceId ?? opts.instanceId,
        externalId: opts.externalId ?? null,
        source,
        content,
        messageType: effectiveType,
        caption,
        direction,
        status: opts.status ?? (opts.fromMe ? 'SENT' : 'RECEIVED'),
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
  } catch {
    // Corrida no índice único (instanceId, externalId) — outra entrega gravou primeiro.
    return 'duplicate';
  }

  const when = opts.createdAt ?? new Date();
  const isNewer = !conv.lastMessageAt || when >= conv.lastMessageAt;
  const data: Record<string, any> = {};
  if (!opts.isHistory || isNewer) {
    data.lastMessage = content;
    data.lastMessageAt = when;
  }
  if (!opts.isHistory && direction === 'INCOMING') data.unreadCount = { increment: 1 };
  if (Object.keys(data).length) await prisma.whatsAppConversation.update({ where: { id: conv.id }, data });

  return isPlaceholder ? 'placeholder' : 'created';
}

// Importa um CHAT como conversa (cria a thread se não existir). Usado pelo sync de
// histórico e pelo CHATS_SET. Opcionalmente semeia o preview da última mensagem.
export async function upsertChatThread(opts: {
  companyId: string;
  instanceId: string | null;
  phone: string;
  name?: string | null;
  avatar?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
}): Promise<'created' | 'updated'> {
  const digits = opts.phone.replace(/\D/g, '');
  const existing = await prisma.whatsAppConversation.findFirst({
    where: { companyId: opts.companyId, contactPhone: { contains: digits.slice(-8) }, deletedAt: null },
  });
  if (!existing) {
    await prisma.whatsAppConversation.create({
      data: {
        companyId: opts.companyId,
        instanceId: opts.instanceId,
        contactName: opts.name || opts.phone,
        contactPhone: opts.phone,
        contactAvatar: opts.avatar ?? null,
        lastMessage: opts.lastMessage ?? null,
        lastMessageAt: opts.lastMessageAt ?? null,
      },
    });
    return 'created';
  }
  const patch: Record<string, any> = {};
  if (!existing.instanceId && opts.instanceId) patch.instanceId = opts.instanceId;
  if (opts.avatar && !existing.contactAvatar) patch.contactAvatar = opts.avatar;
  if (opts.name && existing.contactName === existing.contactPhone && opts.name !== existing.contactPhone) patch.contactName = opts.name;
  if (opts.lastMessage && opts.lastMessageAt && (!existing.lastMessageAt || opts.lastMessageAt > existing.lastMessageAt)) {
    patch.lastMessage = opts.lastMessage;
    patch.lastMessageAt = opts.lastMessageAt;
  }
  if (Object.keys(patch).length) await prisma.whatsAppConversation.update({ where: { id: existing.id }, data: patch });
  return 'updated';
}

// Atualiza nome/foto de um contato (CONTACTS_SET) sem criar conversa nova.
export async function upsertContact(opts: { companyId: string; phone: string; name?: string | null; avatar?: string | null }) {
  const digits = opts.phone.replace(/\D/g, '');
  const conv = await prisma.whatsAppConversation.findFirst({
    where: { companyId: opts.companyId, contactPhone: { contains: digits.slice(-8) }, deletedAt: null },
    select: { id: true, contactName: true, contactPhone: true, contactAvatar: true },
  });
  if (!conv) return;
  const patch: Record<string, any> = {};
  if (opts.avatar && !conv.contactAvatar) patch.contactAvatar = opts.avatar;
  if (opts.name && conv.contactName === conv.contactPhone && opts.name !== conv.contactPhone) patch.contactName = opts.name;
  if (Object.keys(patch).length) await prisma.whatsAppConversation.update({ where: { id: conv.id }, data: patch });
}
