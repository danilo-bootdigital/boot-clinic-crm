// Fixtures da mensageria para os testes de rota.
//
// A conversa não guarda mais nome/telefone: a identidade mora em
// Contact + ContactIdentity (diretriz §4.4). Montar isso à mão em cada teste
// repetiria três creates, então o helper existe para manter os testes falando
// do que importa — a rota — e não do encanamento do contato.
import type { PrismaMock } from './prisma-mock';

export interface SeedConversationOptions {
  companyId: string;
  phone?: string;
  name?: string;
  channel?: 'WHATSAPP' | 'INSTAGRAM' | 'TIKTOK';
  accountId?: string | null;
  status?: string;
  patientId?: string | null;
}

/** Cria contato + identidade + conversa e devolve os três. */
export async function seedConversation(db: PrismaMock, opts: SeedConversationOptions) {
  const channel = opts.channel ?? 'WHATSAPP';
  const phone = opts.phone ?? '5511999998888';

  const contact = await db.contact.create({
    data: {
      companyId: opts.companyId,
      name: opts.name ?? phone,
      phone,
      patientId: opts.patientId ?? null,
    },
  });
  const identity = await db.contactIdentity.create({
    data: { companyId: opts.companyId, contactId: contact.id, channel, externalId: phone },
  });
  const conversation = await db.conversation.create({
    data: {
      companyId: opts.companyId,
      channel,
      contactId: contact.id,
      accountId: opts.accountId ?? null,
      status: opts.status ?? 'OPEN',
    },
  });
  return { contact, identity, conversation };
}
