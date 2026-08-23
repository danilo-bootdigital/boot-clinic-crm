// Editar o deal no formulário — o furo que o select de etapa abria.
//
// O formulário lista TODAS as etapas, "Perdido" incluída. Sem a mesma trava do
// Kanban, salvar o formulário dava o lead como perdido sem motivo — e sem
// status/data, então o cartão ficava numa coluna final com status de aberto.
// Cobre também o pipeline derivado da etapa: aceitar pipelineId do cliente
// deixava o cartão fora de qualquer coluna.
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
import { PATCH } from '@/app/api/crm/deals/[id]/route';
import { getCurrentUser } from '@/lib/auth/server';
import type { PrismaMock } from '@/test/prisma-mock';

const db = prisma as unknown as PrismaMock;

const req = (body: any) =>
  new NextRequest('http://localhost/api/crm/deals/x', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

let deal: any;
let etapaAberta: any;
let etapaPerdido: any;
let outroPipelineStage: any;

beforeEach(async () => {
  db.__reset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' } as any);
  await db.user.create({ data: { id: 'u1', name: 'Recepção', companyId: 'A' } });

  const p1 = await db.pipeline.create({ data: { companyId: 'A', name: 'Padrão', isDefault: true, order: 0 } });
  const p2 = await db.pipeline.create({ data: { companyId: 'A', name: 'Segundo', isDefault: false, order: 1 } });
  etapaAberta = await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: p1.id, name: 'Em negociação', order: 2, finalType: 'NONE' },
  });
  etapaPerdido = await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: p1.id, name: 'Perdido', order: 8, finalType: 'LOST' },
  });
  outroPipelineStage = await db.pipelineStage.create({
    data: { companyId: 'A', pipelineId: p2.id, name: 'Triagem', order: 0, finalType: 'NONE' },
  });
  deal = await db.deal.create({
    data: {
      companyId: 'A', title: 'Agatha — WhatsApp', status: 'IN_NEGOTIATION',
      pipelineId: p1.id, stageId: etapaAberta.id, responsibleUserId: 'u1',
    },
  });
});

describe('PATCH /deals/[id] — etapa de perda pelo formulário', () => {
  it('salvar na etapa Perdido sem motivo → 400 e o deal segue aberto', async () => {
    const res = await PATCH(req({ stageId: etapaPerdido.id }), { params: { id: deal.id } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.needsLossReason).toBe(true);
    expect(body.reasons.map((r: any) => r.name).slice(0, 2)).toEqual(['Preço', 'Distância']);

    const intacto = await db.deal.findUnique({ where: { id: deal.id } });
    expect(intacto!.status).toBe('IN_NEGOTIATION');
    expect(intacto!.stageId).toBe(etapaAberta.id);
  });

  it('com motivo válido → status, data e motivo carimbados', async () => {
    const motivo = await db.dealLossReason.create({ data: { companyId: 'A', name: 'Preço', order: 0 } });
    const res = await PATCH(
      req({ stageId: etapaPerdido.id, lossReasonId: motivo.id }),
      { params: { id: deal.id } }
    );
    expect(res.status).toBe(200);

    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.status).toBe('LOST');
    expect(salvo!.lossReasonId).toBe(motivo.id);
    expect(salvo!.lostAt).toBeTruthy();
    // Rastro: a edição pelo formulário também entra no histórico.
    const atividade = await db.dealActivity.findFirst({ where: { dealId: deal.id } });
    expect(atividade!.description).toContain('Preço');
  });

  it('pipeline vem da etapa, não do que o cliente mandar', async () => {
    const res = await PATCH(
      // pipelineId mentiroso de propósito: o servidor ignora e usa o da etapa.
      req({ stageId: outroPipelineStage.id, pipelineId: 'pipeline-inventado' }),
      { params: { id: deal.id } }
    );
    expect(res.status).toBe(200);
    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.pipelineId).toBe(outroPipelineStage.pipelineId);
  });

  it('editar sem trocar de etapa não exige motivo nem gera histórico', async () => {
    const res = await PATCH(req({ title: 'Agatha — proposta' }), { params: { id: deal.id } });
    expect(res.status).toBe(200);
    const salvo = await db.deal.findUnique({ where: { id: deal.id } });
    expect(salvo!.title).toBe('Agatha — proposta');
    expect(salvo!.status).toBe('IN_NEGOTIATION');
    expect(await db.dealActivity.count()).toBe(0);
  });
});
