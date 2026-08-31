// Regressão do bug "Contato sem telefone para envio".
//
// Causa: o WhatsApp passou a endereçar por `@lid` (Linked ID), que ESCONDE o
// telefone de quem escreve. Medido em produção em 31/08/2026: 584 de 754
// conversas (77%) chegam só com lid, e o payload não traz `senderPn`,
// `remoteJidAlt` nem `participantPn`. Como todo o envio exigia telefone, o
// atendente ficava com a conversa aberta na frente dele sem poder responder.
//
// Duas garantias aqui: (1) o lid resolve como destino de envio; (2) o lid nunca
// vira nome do contato.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import { whatsappDestination, isLidIdentity, isLidDestination } from '../destination';
import { resolveContact } from '@/lib/messaging/contacts';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const COMPANY = 'companyA';
// Lid real observado em produção (15 dígitos — não é telefone).
const LID = '156061965279481';
const FONE = '5511971724254';

describe('identidade @lid — classificação', () => {
  it('lid de 15 dígitos não é telefone', () => {
    expect(isLidIdentity(LID)).toBe(true);
  });

  it('telefone BR completo não é lid', () => {
    expect(isLidIdentity(FONE)).toBe(false);
  });

  it('destino com sufixo @lid é reconhecido', () => {
    expect(isLidDestination(`${LID}@lid`)).toBe(true);
    expect(isLidDestination(FONE)).toBe(false);
  });
});

describe('destino de envio no WhatsApp', () => {
  beforeEach(() => db.__reset());

  it('telefone do contato ganha de qualquer identidade', async () => {
    const dest = await whatsappDestination(COMPANY, 'c1', FONE);
    expect(dest).toBe(FONE);
  });

  it('sem telefone, cai na identidade @lid — e o envio deixa de estar bloqueado', async () => {
    await db.contactIdentity.create({
      data: { companyId: COMPANY, contactId: 'c1', channel: 'WHATSAPP', externalId: LID },
    });
    const dest = await whatsappDestination(COMPANY, 'c1', null);
    expect(dest).toBe(`${LID}@lid`);
  });

  it('com as duas identidades, o telefone ganha do lid', async () => {
    await db.contactIdentity.create({
      data: { companyId: COMPANY, contactId: 'c1', channel: 'WHATSAPP', externalId: LID },
    });
    await db.contactIdentity.create({
      data: { companyId: COMPANY, contactId: 'c1', channel: 'WHATSAPP', externalId: FONE },
    });
    const dest = await whatsappDestination(COMPANY, 'c1', null);
    expect(dest).toBe(FONE);
  });

  it('sem telefone e sem identidade devolve null (a rota recusa com motivo)', async () => {
    const dest = await whatsappDestination(COMPANY, 'orfao', null);
    expect(dest).toBeNull();
  });

  it('não mistura identidade de outra empresa', async () => {
    await db.contactIdentity.create({
      data: { companyId: 'outraEmpresa', contactId: 'c1', channel: 'WHATSAPP', externalId: LID },
    });
    const dest = await whatsappDestination(COMPANY, 'c1', null);
    expect(dest).toBeNull();
  });
});

describe('lid nunca vira nome do contato', () => {
  beforeEach(() => db.__reset());

  it('pushName igual ao lid não é aceito como nome', async () => {
    // É o caso real: o WhatsApp não tem nome para a pessoa e repete o lid no
    // pushName. Antes, "156061965279481" aparecia no lugar do nome.
    const { contact } = await resolveContact({
      companyId: COMPANY,
      channel: 'WHATSAPP' as never,
      externalId: LID,
      name: LID,
      nameIsFromContact: true,
    });
    expect(contact.name).not.toBe(LID);
    expect(contact.name).toBe(`Sem nome · ${LID.slice(-4)}`);
  });

  it('pushName de verdade é usado normalmente', async () => {
    const { contact } = await resolveContact({
      companyId: COMPANY,
      channel: 'WHATSAPP' as never,
      externalId: LID,
      name: 'Marlene',
      nameIsFromContact: true,
    });
    expect(contact.name).toBe('Marlene');
  });

  it('telefone continua servindo de nome quando não há nome', async () => {
    const { contact } = await resolveContact({
      companyId: COMPANY,
      channel: 'WHATSAPP' as never,
      externalId: FONE,
      phone: FONE,
    });
    expect(contact.name).toBe(FONE);
  });

  it('contato de lid não grava telefone falso de 15 dígitos', async () => {
    const { contact } = await resolveContact({
      companyId: COMPANY,
      channel: 'WHATSAPP' as never,
      externalId: LID,
    });
    expect(contact.phone).toBeNull();
  });
});
