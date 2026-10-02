// Etapas do funil: criar, renomear e excluir — e as travas que impedem negócio órfão.
//
// Cobre: etapa vazia sai e o resto é renumerado; etapa com negócios exige
// destino (e leva todos, inclusive os da lixeira); destino final é recusado;
// etapas de desfecho e a última etapa em aberto não saem; isolamento por clínica.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/prisma', async () => {
  const { makePrismaMock } = await import('@/test/prisma-mock');
  return { prisma: makePrismaMock() };
});
vi.mock('@/lib/auth/server', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/session', () => ({ subscriptionBlock: vi.fn(async () => null) }));
vi.mock('@/lib/api/modules', () => ({ requireModuleEnabled: vi.fn(async () => null) }));
vi.mock('@/lib/api/permissions', () => ({ requirePermission: vi.fn(() => null) }));

import { prisma } from '@/lib/db/prisma';
import { DELETE, PATCH } from '@/app/api/crm/pipelines/[pipelineId]/stages/[stageId]/route';
import { POST } from '@/app/api/crm/pipelines/[pipelineId]/stages/route';
import { getCurrentUser } from '@/lib/auth/server';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const call = (pipelineId: string, stageId: string, body: any = {}) =>
  DELETE(
    new NextRequest(`http://localhost/api/crm/pipelines/${pipelineId}/stages/${stageId}`, {
      method: 'DELETE',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: { pipelineId, stageId } }
  );

let pipeline: any;
let lead: any;
let negociacao: any;
let orcamento: any;
let fechado: any;
let perdido: any;

const stage = (name: string, order: number, finalType = 'NONE') =>
  db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: pipeline.id, name, order, finalType, isFinal: finalType !== 'NONE' },
  });

beforeEach(async () => {
  db.__reset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as any);
  await db.user.create({ data: { id: 'u1', companyId: 'A', role: 'ADMIN', name: 'Ana' } });
  pipeline = await db.pipeline.create({ data: { companyId: 'A', name: 'Vendas' } });
  lead = await stage('Lead novo', 1);
  negociacao = await stage('Em negociação', 2);
  orcamento = await stage('Orçamento enviado', 3);
  fechado = await stage('Fechado', 4, 'WON');
  perdido = await stage('Perdido', 5, 'LOST');
});

const deal = (stageId: string, extra: any = {}) =>
  db.deal.create({
    data: { companyId: 'A', pipelineId: pipeline.id, stageId, title: 'Lead', responsibleUserId: 'u1', status: 'NEW', ...extra },
  });

describe('DELETE etapa', () => {
  it('exclui etapa vazia e renumera as restantes sem buraco', async () => {
    const res = await call(pipeline.id, negociacao.id);
    expect(res.status).toBe(200);
    const restantes = await db.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    expect(restantes.map((s: any) => [s.name, s.order])).toEqual([
      ['Lead novo', 1], ['Orçamento enviado', 2], ['Fechado', 3], ['Perdido', 4],
    ]);
  });

  it('etapa com negócios sem destino é recusada e nada muda', async () => {
    await deal(negociacao.id);
    const res = await call(pipeline.id, negociacao.id);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.needsTarget).toBe(true);
    expect(body.dealCount).toBe(1);
    expect(await db.pipelineStage.findFirst({ where: { id: negociacao.id } })).not.toBeNull();
  });

  it('move todos os negócios (inclusive da lixeira) para o destino', async () => {
    const a = await deal(negociacao.id);
    const b = await deal(negociacao.id, { deletedAt: new Date() });
    const res = await call(pipeline.id, negociacao.id, { moveToStageId: lead.id });
    expect(res.status).toBe(200);
    expect((await res.json()).movedDeals).toBe(1);
    expect((await db.deal.findFirst({ where: { id: a.id } }))!.stageId).toBe(lead.id);
    expect((await db.deal.findFirst({ where: { id: b.id } }))!.stageId).toBe(lead.id);
    expect(await db.pipelineStage.findFirst({ where: { id: negociacao.id } })).toBeNull();
  });

  it('recusa destino final (entrar em Perdido pede motivo um a um)', async () => {
    await deal(negociacao.id);
    const res = await call(pipeline.id, negociacao.id, { moveToStageId: perdido.id });
    expect(res.status).toBe(400);
    expect(await db.pipelineStage.findFirst({ where: { id: negociacao.id } })).not.toBeNull();
  });

  it('não exclui etapas de desfecho', async () => {
    expect((await call(pipeline.id, fechado.id)).status).toBe(400);
    expect((await call(pipeline.id, perdido.id)).status).toBe(400);
  });

  it('mantém pelo menos uma etapa em aberto', async () => {
    expect((await call(pipeline.id, lead.id)).status).toBe(200);
    expect((await call(pipeline.id, negociacao.id)).status).toBe(200);
    expect((await call(pipeline.id, orcamento.id)).status).toBe(400);
  });

  it('não exclui etapa de outra clínica', async () => {
    const outro = await db.pipeline.create({ data: { companyId: 'B', name: 'Vendas B' } });
    const deB = await db.pipelineStage.create({
      data: { companyId: 'B', pipelineId: outro.id, name: 'Lead', order: 1, finalType: 'NONE' },
    });
    expect((await call(outro.id, deB.id)).status).toBe(404);
    expect(await db.pipelineStage.findFirst({ where: { id: deB.id } })).not.toBeNull();
  });
});

const send = (method: string, url: string, body: any) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('POST etapa', () => {
  it('cria a etapa antes de Fechado/Perdido e renumera', async () => {
    const res = await POST(send('POST', '/x', { name: 'Avaliação', color: '#EC4899' }), {
      params: { pipelineId: pipeline.id },
    });
    expect(res.status).toBe(201);
    const ordem = await db.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    expect(ordem.map((s: any) => s.name)).toEqual([
      'Lead novo', 'Em negociação', 'Orçamento enviado', 'Avaliação', 'Fechado', 'Perdido',
    ]);
    expect(ordem.find((s: any) => s.name === 'Avaliação')!.finalType).toBe('NONE');
  });

  it('recusa nome repetido (sem diferenciar maiúsculas)', async () => {
    const res = await POST(send('POST', '/x', { name: '  lead NOVO ' }), { params: { pipelineId: pipeline.id } });
    expect(res.status).toBe(409);
  });

  it('recusa nome vazio', async () => {
    const res = await POST(send('POST', '/x', { name: '   ' }), { params: { pipelineId: pipeline.id } });
    expect(res.status).toBe(400);
  });
});

describe('PATCH etapa', () => {
  it('renomeia etapa final sem mexer no tipo', async () => {
    const res = await PATCH(send('PATCH', '/x', { name: 'Ganho' }), {
      params: { pipelineId: pipeline.id, stageId: fechado.id },
    });
    expect(res.status).toBe(200);
    const salvo = await db.pipelineStage.findFirst({ where: { id: fechado.id } });
    expect(salvo!.name).toBe('Ganho');
    expect(salvo!.finalType).toBe('WON');
  });

  it('recusa nome de outra etapa', async () => {
    const res = await PATCH(send('PATCH', '/x', { name: 'Perdido' }), {
      params: { pipelineId: pipeline.id, stageId: lead.id },
    });
    expect(res.status).toBe(409);
  });

  it('não edita etapa de outra clínica', async () => {
    const outro = await db.pipeline.create({ data: { companyId: 'B', name: 'Vendas B' } });
    const deB = await db.pipelineStage.create({
      data: { companyId: 'B', pipelineId: outro.id, name: 'Lead', order: 1, finalType: 'NONE' },
    });
    const res = await PATCH(send('PATCH', '/x', { name: 'Hack' }), { params: { pipelineId: outro.id, stageId: deB.id } });
    expect(res.status).toBe(404);
  });
});
