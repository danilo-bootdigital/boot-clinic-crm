// Regressão do bug "todos os contatos com o nome do dono do WhatsApp".
//
// Causa: `pushName` é o nome de QUEM ENVIOU. Em mensagem `fromMe` (source
// MOBILE/CRM) o pushName é o do dono do número, mas o telefone é o da outra
// pessoa — então usar esse nome batiza todo mundo igual. O sync de histórico,
// que importa muitas mensagens fromMe, espalhava o erro por toda a base.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});

import { prisma } from '@/lib/db/prisma';
import { ingestMessage } from '@/lib/messaging/ingest';
import { resolveContact } from '@/lib/messaging/contacts';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const COMPANY = 'companyA';
const DONO = 'Clínica Boot (dono)';

async function nomesDosContatos() {
  const rows = await db.contact.findMany({ where: { companyId: COMPANY } });
  return rows.map((c: any) => c.name);
}

describe('nome do contato — procedência', () => {
  beforeEach(() => db.__reset());

  it('mensagem ENVIADA (MOBILE) não batiza o contato com o nome do dono', async () => {
    await ingestMessage({
      companyId: COMPANY,
      provenance: { channel: 'WHATSAPP' as never, accountId: 'acc1', source: 'MOBILE' as never },
      contact: { externalId: '5511900000001', name: DONO, phone: '5511900000001' },
      text: 'oi, tudo bem?',
      externalId: 'm1',
    });
    // Sem nome confiável, o telefone serve de nome — nunca o nome do dono.
    expect(await nomesDosContatos()).toEqual(['5511900000001']);
  });

  it('mensagem RECEBIDA (CONTACT) usa o pushName como nome do contato', async () => {
    await ingestMessage({
      companyId: COMPANY,
      provenance: { channel: 'WHATSAPP' as never, accountId: 'acc1', source: 'CONTACT' as never },
      contact: { externalId: '5511900000002', name: 'Maria Souza', phone: '5511900000002' },
      text: 'quero marcar consulta',
      externalId: 'm2',
    });
    expect(await nomesDosContatos()).toEqual(['Maria Souza']);
  });

  it('vários contatos com fromMe não colapsam no mesmo nome', async () => {
    const phones = ['5511900000011', '5511900000022', '5511900000033'];
    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];
      await ingestMessage({
        companyId: COMPANY,
        provenance: { channel: 'WHATSAPP' as never, accountId: 'acc1', source: 'MOBILE' as never },
        contact: { externalId: phone, name: DONO, phone },
        text: 'mensagem enviada pela clínica',
        externalId: `out-${i}`,
      });
    }
    const nomes = await nomesDosContatos();
    expect(nomes).toEqual(['5511900000011', '5511900000022', '5511900000033']);
    expect(new Set(nomes).size).toBe(3); // o sintoma do bug era size === 1
  });

  it('mensagem recebida corrige um contato que ficou só com o telefone', async () => {
    const phone = '5511900000044';
    await ingestMessage({
      companyId: COMPANY,
      provenance: { channel: 'WHATSAPP' as never, accountId: 'acc1', source: 'MOBILE' as never },
      contact: { externalId: phone, name: DONO, phone },
      text: 'primeiro contato pela clínica',
      externalId: 'out-x',
    });
    expect(await nomesDosContatos()).toEqual([phone]);

    await ingestMessage({
      companyId: COMPANY,
      provenance: { channel: 'WHATSAPP' as never, accountId: 'acc1', source: 'CONTACT' as never },
      contact: { externalId: phone, name: 'João Lima', phone },
      text: 'oi!',
      externalId: 'in-x',
    });
    expect(await nomesDosContatos()).toEqual(['João Lima']);
  });

  it('nome MANUAL nunca é sobrescrito pelo canal', async () => {
    const phone = '5511900000055';
    const contact = await db.contact.create({
      data: { companyId: COMPANY, name: 'Nome Corrigido na Recepção', nameSource: 'MANUAL', phone },
    });
    await db.contactIdentity.create({
      data: { companyId: COMPANY, contactId: contact.id, channel: 'WHATSAPP', externalId: phone },
    });

    await resolveContact({
      companyId: COMPANY,
      channel: 'WHATSAPP' as never,
      externalId: phone,
      name: 'Apelido Qualquer do Canal',
      phone,
      nameIsFromContact: true,
    });

    expect(await nomesDosContatos()).toEqual(['Nome Corrigido na Recepção']);
  });
});
