// Para ONDE mandar no WhatsApp.
//
// Existe porque o telefone deixou de ser garantido. O WhatsApp passou a
// endereçar por `@lid` (Linked ID) — identidade opaca que ESCONDE o número de
// quem escreve. Não é falha da Evolution nem do ingest: o número não é
// transmitido. Medido nesta base em 31/08/2026: 584 de 754 conversas (77%)
// chegam só com lid, e nenhum campo do payload (`senderPn`, `remoteJidAlt`,
// `participantPn`) traz o telefone junto.
//
// Exigir telefone para responder deixava o atendente travado com a conversa
// aberta na frente dele ("Contato sem telefone para envio"). Responder pelo lid
// é o que o próprio WhatsApp Web faz — o telefone nunca foi necessário para
// responder a quem já escreveu.
import { Channel } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { looksLikePhone } from '@/lib/messaging/phone';

/** Sufixo do jid de identidade opaca do WhatsApp. */
export const LID_SUFFIX = '@lid';

/** Mensagem única de recusa — quando não há NEM telefone NEM identidade. */
export const NO_DESTINATION = 'Contato sem número nem identidade de WhatsApp para envio';

/** True quando o destino é um jid `@lid` (identidade), não um telefone. */
export function isLidDestination(dest?: string | null): boolean {
  return !!dest && dest.endsWith(LID_SUFFIX);
}

/**
 * True quando a identidade de canal é um `@lid` e NÃO um telefone.
 *
 * O `externalId` da ContactIdentity guarda a parte local do jid: para contato
 * antigo é o telefone (`5511999999999`), para contato novo é o lid (15 dígitos).
 * `looksLikePhone` já rejeita 14–15 dígitos exatamente por causa do lid.
 */
export function isLidIdentity(externalId?: string | null): boolean {
  return !!externalId && !looksLikePhone(externalId);
}

/**
 * Destino de envio do contato: telefone quando existe, senão o jid `@lid`.
 *
 * Preferimos SEMPRE o telefone — ele funciona em qualquer versão do provedor e
 * sobrevive à troca de aparelho da pessoa. O lid é o fallback que destrava a
 * resposta quando o WhatsApp não entregou número nenhum.
 *
 * `null` só quando não há telefone nem identidade — aí a rota recusa com motivo
 * legível em vez de gravar mensagem que nunca sai.
 */
export async function whatsappDestination(
  companyId: string,
  contactId: string,
  phone?: string | null,
): Promise<string | null> {
  if (phone) return phone;

  const identities = await prisma.contactIdentity.findMany({
    where: { companyId, contactId, channel: Channel.WHATSAPP },
    select: { externalId: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!identities.length) return null;

  // Um contato pode ter as duas identidades (falou pelo número antes de o
  // WhatsApp migrar para lid). O telefone ganha.
  const phoneIdentity = identities.find((i) => looksLikePhone(i.externalId));
  if (phoneIdentity) return phoneIdentity.externalId;

  return `${identities[0].externalId}${LID_SUFFIX}`;
}
