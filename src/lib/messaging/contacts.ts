// Resolução de identidade da mensageria — quem é a pessoa do outro lado.
//
// Regra (diretriz §4.4): a identidade mora no Contact, não na conversa. A mesma
// pessoa falando por Instagram e WhatsApp é UM Contact com duas
// ContactIdentity. Fusão de contatos é ação MANUAL do atendente — nunca
// automática por semelhança de nome, senão histórico de uma pessoa vaza para
// outra.
import { Channel } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Normaliza telefone para dígitos. O WhatsApp entrega o número em formatos que
// variam (com/sem código de país, com/sem o 9º dígito), por isso a busca por
// sufixo existe — mas a identidade é gravada com o valor completo que veio.
export function normalizePhone(value?: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return digits || undefined;
}

// Sufixo usado para casar números escritos de formas diferentes.
function phoneSuffix(digits: string): string {
  return digits.slice(-8);
}

export interface ResolveContactInput {
  companyId: string;
  channel: Channel;
  /** Identidade no canal: telefone (WhatsApp), IGSID (Instagram), open_id (TikTok). */
  externalId: string;
  name?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  /** Telefone, quando o canal informa separadamente da identidade. */
  phone?: string | null;
}

/**
 * Devolve o Contact dono desta identidade, criando o que faltar.
 *
 * Ordem (diretriz §4.4):
 *  1. Identidade já existe → usa o Contact dela.
 *  2. Canal deu telefone e existe Contact com esse telefone → ANEXA a
 *     identidade nova ao contato existente (é a mesma pessoa em outro canal).
 *  3. Nada bateu → cria Contact + ContactIdentity.
 */
export async function resolveContact(input: ResolveContactInput) {
  const { companyId, channel, externalId } = input;
  const phone = normalizePhone(input.phone ?? (channel === Channel.WHATSAPP ? externalId : null));

  // 1. Identidade exata.
  let identity = await prisma.contactIdentity.findUnique({
    where: { companyId_channel_externalId: { companyId, channel, externalId } },
    include: { contact: true },
  });

  // 1b. WhatsApp escreve o mesmo número de formas diferentes; tenta por sufixo
  // antes de concluir que é gente nova.
  if (!identity && phone && phone.length >= 8) {
    const candidate = await prisma.contactIdentity.findFirst({
      where: {
        companyId,
        channel,
        externalId: { endsWith: phoneSuffix(phone) },
      },
      include: { contact: true },
    });
    if (candidate) identity = candidate;
  }

  if (identity) {
    await enrichContact(identity.contactId, identity, input, phone);
    return { contact: identity.contact, identityId: identity.id, created: false };
  }

  // 2. Mesmo telefone em outro canal → é a mesma pessoa.
  let contact = null;
  if (phone && phone.length >= 8) {
    contact = await prisma.contact.findFirst({
      where: { companyId, phone: { endsWith: phoneSuffix(phone) }, deletedAt: null },
    });
  }

  // 3. Gente nova.
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        companyId,
        name: input.name?.trim() || input.handle?.trim() || externalId,
        phone: phone ?? null,
      },
    });
  }

  // A identidade pode ter sido criada por uma entrega concorrente.
  try {
    const createdIdentity = await prisma.contactIdentity.create({
      data: {
        companyId,
        contactId: contact.id,
        channel,
        externalId,
        handle: input.handle ?? null,
        avatarUrl: input.avatarUrl ?? null,
      },
    });
    return { contact, identityId: createdIdentity.id, created: true };
  } catch {
    const existing = await prisma.contactIdentity.findUnique({
      where: { companyId_channel_externalId: { companyId, channel, externalId } },
      include: { contact: true },
    });
    if (existing) return { contact: existing.contact, identityId: existing.id, created: false };
    throw new Error('Falha ao resolver identidade do contato');
  }
}

/**
 * Melhora os dados do contato sem sobrescrever informação melhor por pior.
 * Nome só é promovido quando o atual é o próprio identificador (placeholder).
 */
async function enrichContact(
  contactId: string,
  identity: { avatarUrl: string | null; handle: string | null; externalId: string },
  input: ResolveContactInput,
  phone?: string
) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  });
  if (!contact) return;

  const contactPatch: Record<string, unknown> = {};
  const isPlaceholderName =
    contact.name === identity.externalId || contact.name === input.externalId || contact.name === contact.phone;
  const incomingName = input.name?.trim();
  if (incomingName && incomingName !== identity.externalId && isPlaceholderName) {
    contactPatch.name = incomingName;
  }
  if (!contact.phone && phone) contactPatch.phone = phone;
  if (Object.keys(contactPatch).length) {
    await prisma.contact.update({ where: { id: contactId }, data: contactPatch });
  }

  const identityPatch: Record<string, unknown> = {};
  if (input.avatarUrl && !identity.avatarUrl) identityPatch.avatarUrl = input.avatarUrl;
  if (input.handle && !identity.handle) identityPatch.handle = input.handle;
  if (Object.keys(identityPatch).length) {
    await prisma.contactIdentity.updateMany({
      where: { companyId: input.companyId, channel: input.channel, externalId: identity.externalId },
      data: identityPatch,
    });
  }
}
