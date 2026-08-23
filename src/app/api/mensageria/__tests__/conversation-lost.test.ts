// Dar o lead como perdido pela conversa (diretriz §5).
//
// Cobre o que faz a informação valer: perdido SEM motivo é recusado (senão o
// funil registra a perda e não o porquê), motivo de OUTRA clínica é recusado
// (id vem do cliente e não se confia nele), e lead que nunca entrou no funil
// vira negócio já perdido — se dependesse de alguém ter clicado em "enviar para
// o funil" antes, a perda desapareceria do relatório.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { seedConversation } from '@/test/messaging-fixtures';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/api/session', () => ({ resolveModuleUser: vi.fn() }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));

import { prisma } from '@/lib/db/prisma';
import { GET, POST } from '@/app/api/mensageria/conversations/[id]/deal/lost/route';
import { resolveModuleUser } from '@/lib/api/session';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;
const asUser = (companyId: string) => ({ dbUser: { id: 'u1', name: 'Recepção', companyId } });

const postReq = (body: any) =>
  new NextRequest('http://localhost/api/mensageria/conversations/x/deal/lost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
const getReq = () => new NextRequest('http://localhost/api/mensageria/conversations/x/deal/lost');

let conv: any;

beforeEach(async () => {
  db.__reset();
  vi.mocked(resolveModuleUser).mockResolvedValue(asUser('A') as any);
  conv = (await seedConversation(db, { companyId: 'A', name: 'Agatha' })).conversation;

  const pipeline = await db.pipeline.create({ data: { companyId: 'A', name: 'Padrão', isDefault: true, order: 0 } });
  await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: pipeline.id, name: 'Perdido', order: 8, finalType: 'LOST', isFinal: true },
  });
});

describe('GET — contexto do perdido', () => {
  it('semeia os motivos padrão na clínica que ainda não tem nenhum', async () => {
    const res = await GET(getReq(), { params: { id: conv.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    const nomes = body.reasons.map((r: any) => r.name);
    // Os dois primeiros são os que a clínica pediu, na ordem.
    expect(nomes.slice(0, 2)).toEqual(['Preço', 'Distância']);
    expect(body.hasLostStage).toBe(true);
  });

  it('não recria os motivos quando a clínica já tem cadastro próprio', async () => {
    await db.dealLossReason.create({ data: { companyId: 'A', name: 'Só esse', order: 0 } });
    const res = await GET(getReq(), { params: { id: conv.id } });
    const body = await res.json();
    expect(body.reasons.map((r: any) => r.name)).toEqual(['Só esse']);
  });
});

describe('POST — perdido exige motivo válido', () => {
  it('sem motivo → 400 e nenhum negócio criado', async () => {
    const res = await POST(postReq({}), { params: { id: conv.id } });
    expect(res.status).toBe(400);
    expect(await db.deal.count()).toBe(0);
  });

  it('motivo de outra clínica → 400 e nenhum negócio criado', async () => {
    const alheio = await db.dealLossReason.create({ data: { companyId: 'B', name: 'Preço', order: 0 } });
    const res = await POST(postReq({ lossReasonId: alheio.id }), { params: { id: conv.id } });
    expect(res.status).toBe(400);
    expect(await db.deal.count()).toBe(0);
  });

  it('motivo removido não serve mais para novas perdas', async () => {
    const antigo = await db.dealLossReason.create({
      data: { companyId: 'A', name: 'Aposentado', order: 0, deletedAt: new Date() },
    });
    const res = await POST(postReq({ lossReasonId: antigo.id }), { params: { id: conv.id } });
    expect(res.status).toBe(400);
  });
});

describe('POST — registro da perda', () => {
  it('negócio aberto vira PERDIDO com motivo e etapa final', async () => {
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Preço', order: 0 } });
    const aberto = await db.deal.create({
      data: {
        companyId: 'A', title: 'Agatha — WhatsApp', status: 'NEW',
        contactId: conv.contactId, responsibleUserId: 'u1',
      },
    });

    const res = await POST(postReq({ lossReasonId: motivo.id }), { params: { id: conv.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(false);

    const salvo = await db.deal.findUnique({ where: { id: aberto.id } });
    expect(salvo!.status).toBe('LOST');
    expect(salvo!.lossReasonId).toBe(motivo.id);
    expect(salvo!.lostAt).toBeTruthy();
    // Cartão vai para a coluna Perdido, não fica órfão numa etapa em aberto.
    const perdido = await db.pipelineStage.findFirst({ where: { companyId: 'A', finalType: 'LOST' } });
    expect(salvo!.stageId).toBe(perdido!.id);
    // O motivo entra no histórico em texto, legível sem cruzar id com cadastro.
    const atividade = await db.dealActivity.findFirst({ where: { dealId: aberto.id } });
    expect(atividade!.description).toContain('Preço');
  });

  it('lead sem negócio no funil nasce já perdido (a perda não pode sumir do relatório)', async () => {
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Distância', order: 1 } });

    const res = await POST(postReq({ lossReasonId: motivo.id }), { params: { id: conv.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(true);

    const criado = await db.deal.findFirst({ where: { companyId: 'A' } });
    expect(criado!.status).toBe('LOST');
    expect(criado!.lossReasonId).toBe(motivo.id);
    expect(criado!.contactId).toBe(conv.contactId);
    // Origem derivada do canal — não é escolha de quem clica (§5).
    expect(criado!.source).toBe('WHATSAPP');
  });

  it('não mexe em conversa de outra clínica', async () => {
    const outra = (await seedConversation(db, { companyId: 'B', name: 'De outra clínica', phone: '5511911112222' })).conversation;
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Preço', order: 0 } });
    const res = await POST(postReq({ lossReasonId: motivo.id }), { params: { id: outra.id } });
    expect(res.status).toBe(404);
    expect(await db.deal.count()).toBe(0);
  });
});
