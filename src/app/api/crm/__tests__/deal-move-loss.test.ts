// Mover cartão no Kanban — a trava do perdido.
//
// Cobre: etapa final de perda sem motivo é recusada (com a lista para a tela
// abrir o seletor), motivo válido carimba o negócio, e voltar de um desfecho
// final desfaz o desfecho — sem isto o negócio ficava com status LOST numa etapa
// em aberto, fora do funil e ainda contado como perda no relatório.
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
vi.mock('@/lib/automations/engine', () => ({ runAutomations: vi.fn(async () => undefined) }));

import { prisma } from '@/lib/db/prisma';
import { PATCH } from '@/app/api/crm/deals/[id]/move/route';
import { getCurrentUser } from '@/lib/auth/server';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const req = (body: any) =>
  new NextRequest('http://localhost/api/crm/deals/x/move', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

let deal: any;
let etapaAberta: any;
let etapaPerdido: any;

beforeEach(async () => {
  db.__reset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as any);
  await db.user.create({ data: { id: 'u1', name: 'Recepção', companyId: 'A' } });

  const pipeline = await db.pipeline.create({ data: { companyId: 'A', name: 'Padrão', isDefault: true, order: 0 } });
  etapaAberta = await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: pipeline.id, name: 'Em negociação', order: 2, finalType: 'NONE', isFinal: false },
  });
  etapaPerdido = await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: pipeline.id, name: 'Perdido', order: 8, finalType: 'LOST', isFinal: true },
  });
  deal = await db.deal.create({
    data: {
      companyId: 'A', title: 'Agatha — WhatsApp', status: 'IN_NEGOTIATION',
      pipelineId: pipeline.id, stageId: etapaAberta.id, responsibleUserId: 'u1',
    },
  });
});

describe('etapa final de perda exige motivo', () => {
  it('sem motivo → 400 com needsLossReason e a lista de motivos; nada muda no negócio', async () => {
    const res = await PATCH(req({ newStageId: etapaPerdido.id }), { params: { id: deal.id } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.needsLossReason).toBe(true);
    expect(body.reasons.map((r: any) => r.name).slice(0, 2)).toEqual(['Preço', 'Distância']);

    const intacto = await db.deal.findUnique({ where: { id: deal.id } });
    expect(intacto!.status).toBe('IN_NEGOTIATION');
    expect(intacto!.stageId).toBe(etapaAberta.id);
  });

  it('motivo de outra clínica → 400', async () => {
    const alheio = await db.dealLossReason.create({ data: { companyId: 'B', name: 'Preço', order: 0 } });
    const res = await PATCH(
      req({ newStageId: etapaPerdido.id, lossReasonId: alheio.id }),
      { params: { id: deal.id } }
    );
    expect(res.status).toBe(400);
    expect((await db.deal.findUnique({ where: { id: deal.id } }))!.status).toBe('IN_NEGOTIATION');
  });

  it('motivo válido → PERDIDO com o motivo carimbado e citado no histórico', async () => {
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Distância', order: 1 } });
    const res = await PATCH(
      req({ newStageId: etapaPerdido.id, lossReasonId: motivo.id }),
      { params: { id: deal.id } }
    );
    expect(res.status).toBe(200);

    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.status).toBe('LOST');
    expect(salvo!.lossReasonId).toBe(motivo.id);
    expect(salvo!.lostAt).toBeTruthy();

    const atividade = await db.dealActivity.findFirst({ where: { dealId: deal.id } });
    expect(atividade!.description).toContain('Distância');
  });
});

describe('voltar de um desfecho final', () => {
  it('perdido que volta para etapa aberta deixa de ser perdido e solta o motivo', async () => {
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Preço', order: 0 } });
    await PATCH(req({ newStageId: etapaPerdido.id, lossReasonId: motivo.id }), { params: { id: deal.id } });

    await PATCH(req({ newStageId: etapaAberta.id }), { params: { id: deal.id } });
    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.status).toBe('NEW');
    expect(salvo!.lossReasonId).toBeNull();
    expect(salvo!.lostAt).toBeNull();
  });

  it('move comum entre etapas abertas não mexe no status', async () => {
    const outra = await db.pipelineStage.create({
      data: { companyId: 'A', pipelineId: deal.pipelineId, name: 'Orçamento enviado', order: 4, finalType: 'NONE', isFinal: false },
    });
    await PATCH(req({ newStageId: outra.id }), { params: { id: deal.id } });
    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.status).toBe('IN_NEGOTIATION');
    expect(salvo!.stageId).toBe(outra.id);
  });
});
