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

export type IngestResult = 'created' | 'duplicate' | 'skipped';

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
  externalId?: string | null;
  fromMe: boolean;
  status?: string;
  createdAt?: Date;
  isHistory?: boolean;
}): Promise<IngestResult> {
  const text = opts.text;
  if (!opts.phone || !text) return 'skipped';

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

  try {
    await prisma.whatsAppMessage.create({
      data: {
        companyId: opts.companyId,
        conversationId: conv.id,
        instanceId: conv.instanceId ?? opts.instanceId,
        externalId: opts.externalId ?? null,
        source,
        content: text,
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
    data.lastMessage = text;
    data.lastMessageAt = when;
  }
  if (!opts.isHistory && direction === 'INCOMING') data.unreadCount = { increment: 1 };
  if (Object.keys(data).length) await prisma.whatsAppConversation.update({ where: { id: conv.id }, data });

  return 'created';
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
