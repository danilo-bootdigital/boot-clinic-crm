import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { stockCan, stockModuleLevel, stockStatus, isStockManager } from '@/lib/stock-caps';
import { avgCostAfterRemoving, exitBlockReason, needsTemperatureConfirm, pickFefoLot, weightedAvgCost } from '@/lib/stock/rules';
import { stockJson } from '@/lib/api/stock-access';
import { CreateItemSchema, MovementSchema } from '@/lib/validations/stock';

describe('permissões do estoque (§7)', () => {
  it('médico nunca vê custo, mas consome e movimenta controlado', () => {
    expect(stockCan('DOCTOR', 'view_cost')).toBe(false);
    expect(stockCan('DOCTOR', 'consume')).toBe(true);
    expect(stockCan('DOCTOR', 'controlled')).toBe(true);
    expect(stockCan('DOCTOR', 'adjust')).toBe(false);
  });

  it('recepção consome, recebe e transfere; não ajusta nem vê custo', () => {
    for (const cap of ['view', 'consume', 'receive', 'transfer', 'count', 'sell'] as const) expect(stockCan('RECEPTION', cap)).toBe(true);
    for (const cap of ['view_cost', 'adjust', 'manage', 'controlled'] as const) expect(stockCan('RECEPTION', cap)).toBe(false);
  });

  it('gestão tem tudo; marketing/atendimento nada', () => {
    for (const role of ['OWNER', 'MANAGER', 'SUPER_ADMIN']) {
      expect(stockCan(role, 'adjust')).toBe(true);
      expect(isStockManager(role)).toBe(true);
    }
    for (const role of ['MARKETING', 'ATTENDANCE', '', null]) {
      expect(stockCan(role, 'view')).toBe(false);
      expect(stockModuleLevel(role)).toBe('none');
    }
    expect(isStockManager('FINANCE')).toBe(false);
  });
});

describe('situação de reposição', () => {
  it('zerado < crítico (mínimo) < repor (ponto de pedido) < ok', () => {
    expect(stockStatus(0, 5, 10)).toBe('zerado');
    expect(stockStatus(5, 5, 10)).toBe('critico');
    expect(stockStatus(8, 5, 10)).toBe('repor');
    expect(stockStatus(11, 5, 10)).toBe('ok');
    expect(stockStatus(3, null, null)).toBe('ok');
  });
});

describe('custo médio ponderado (§5.7)', () => {
  it('pondera a entrada pelo saldo atual', () => {
    expect(weightedAvgCost(100, 10, 100, 20)).toBe(15);
  });
  it('estoque zerado: a entrada define o custo', () => {
    expect(weightedAvgCost(0, 999, 10, 7)).toBe(7);
  });
  it('estorno da entrada desfaz a média', () => {
    const after = weightedAvgCost(100, 10, 100, 20); // 15
    expect(avgCostAfterRemoving(200, after, 100, 20)).toBeCloseTo(10, 10);
  });
  it('estorno que zera o estoque mantém a média', () => {
    expect(avgCostAfterRemoving(10, 7, 10, 7)).toBe(7);
  });
});

describe('travas de lote (§5.5/§5.6)', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const ok = { lotNumber: 'A1', status: 'LIBERADO', expiresAt: '2027-01-01' };
  const vencido = { lotNumber: 'V1', status: 'LIBERADO', expiresAt: '2026-10-01' };
  const bloqueado = { lotNumber: 'B1', status: 'BLOQUEADO', expiresAt: '2027-01-01' };

  it('lote vencido não sai por consumo, só por perda', () => {
    expect(exitBlockReason('CONSUMO_INTERNO', vencido, now)).toMatch(/vencido/);
    expect(exitBlockReason('PERDA', vencido, now)).toBeNull();
  });
  it('lote bloqueado só sai como perda/devolução; transferir é permitido', () => {
    expect(exitBlockReason('CONSUMO_INTERNO', bloqueado, now)).toMatch(/bloqueado/);
    expect(exitBlockReason('DEVOLUCAO_FORNECEDOR', bloqueado, now)).toBeNull();
    expect(exitBlockReason('TRANSFERENCIA_SAIDA', bloqueado, now)).toBeNull();
  });
  it('lote liberado e válido sai', () => {
    expect(exitBlockReason('CONSUMO_INTERNO', ok, now)).toBeNull();
  });
});

describe('FEFO (§5.4)', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const c = (lotId: string, quantity: number, expiresAt: string | null, status = 'LIBERADO', createdAt = '2026-01-01') =>
    ({ lotId, quantity, lot: { lotNumber: lotId, status, expiresAt, createdAt } });

  it('escolhe o de menor validade com saldo suficiente', () => {
    const pick = pickFefoLot([c('tarde', 50, '2027-06-01'), c('cedo', 50, '2026-12-01'), c('sem', 50, null)], 10, now);
    expect(pick?.lotId).toBe('cedo');
  });
  it('pula vencido, bloqueado e sem saldo suficiente', () => {
    const pick = pickFefoLot([c('venc', 50, '2026-10-01'), c('bloq', 50, '2026-11-01', 'QUARENTENA'), c('pouco', 2, '2026-11-15'), c('ok', 50, '2027-03-01')], 10, now);
    expect(pick?.lotId).toBe('ok');
  });
  it('sem validade vai por último; nada elegível = null', () => {
    expect(pickFefoLot([c('sem', 50, null), c('com', 50, '2027-01-01')], 1, now)?.lotId).toBe('com');
    expect(pickFefoLot([c('pouco', 1, '2027-01-01')], 5, now)).toBeNull();
  });
});

describe('temperatura (§5.12)', () => {
  it('refrigerado fora da geladeira pede confirmação; ambiente vai a qualquer lugar', () => {
    expect(needsTemperatureConfirm('REFRIGERADO', 'AMBIENTE')).toBe(true);
    expect(needsTemperatureConfirm('REFRIGERADO', 'REFRIGERADO')).toBe(false);
    expect(needsTemperatureConfirm('AMBIENTE', 'REFRIGERADO')).toBe(false);
  });
});

describe('custo removido do JSON para quem não tem view_cost', () => {
  const payload = {
    item: { name: 'Toxina', avgCost: new Prisma.Decimal('12.5'), lastCost: new Prisma.Decimal('13'), salePrice: null, totalQty: 3 },
    movements: [{ quantity: new Prisma.Decimal('-1.5'), unitCost: new Prisma.Decimal('12.5'), totalCost: new Prisma.Decimal('18.75'), occurredAt: new Date('2026-10-10T00:00:00Z'), snapshot: { unitCost: 1 } }],
    stockValue: 37.5,
  };

  it('médico/recepção: nenhum campo de valor, em qualquer nível', () => {
    const out = stockJson(payload, false);
    const text = JSON.stringify(out);
    for (const k of ['avgCost', 'lastCost', 'unitCost', 'totalCost', 'salePrice', 'stockValue']) expect(text).not.toContain(`"${k}"`);
    expect(out.movements[0].quantity).toBe(-1.5);
    expect(out.movements[0].occurredAt).toBe('2026-10-10T00:00:00.000Z');
  });

  it('gestão: valores preservados e Decimal vira número', () => {
    const out = stockJson(payload, true);
    expect(out.item.avgCost).toBe(12.5);
    expect(out.movements[0].totalCost).toBe(18.75);
  });
});

describe('validações', () => {
  const base = { name: 'Diazepam 10mg', kind: 'MEDICAMENTO', baseUnit: 'un' };

  it('controlado exige a lista da Portaria 344', () => {
    const r = CreateItemSchema.safeParse({ ...base, isControlled: true, tracksLot: true, tracksPatient: true });
    expect(r.success).toBe(false);
    expect(CreateItemSchema.safeParse({ ...base, isControlled: true, controlledList: 'B1', tracksLot: true, tracksPatient: true }).success).toBe(true);
  });

  it('validade sem lote é recusada', () => {
    expect(CreateItemSchema.safeParse({ ...base, tracksLot: false, tracksExpiry: true }).success).toBe(false);
  });

  it('quantidade: positiva e até 4 casas', () => {
    const mv = (quantity: number) => MovementSchema.safeParse({ operation: 'CONSUMO', itemId: 'i', locationId: 'l', quantity });
    expect(mv(0.5).success).toBe(true);
    expect(mv(12.5).success).toBe(true);
    expect(mv(0).success).toBe(false);
    expect(mv(-1).success).toBe(false);
    expect(mv(0.00001).success).toBe(false);
  });

  it('ajuste exige motivo', () => {
    expect(MovementSchema.safeParse({ operation: 'AJUSTE', itemId: 'i', locationId: 'l', lotId: 'x', direction: 'OUT', quantity: 1 }).success).toBe(false);
  });
});

describe('rateio de frete/desconto (Fase 2)', () => {
  it('soma das partes é exatamente o total, proporcional ao valor', async () => {
    const { allocateCents } = await import('@/lib/stock/rules');
    const parts = allocateCents(10_000, [3_000, 7_000]);
    expect(parts).toEqual([3_000, 7_000]);
    const odd = allocateCents(100, [1, 1, 1]);
    expect(odd.reduce((s, p) => s + p, 0)).toBe(100);
    expect(odd).toEqual([34, 33, 33]);
  });
  it('pesos zerados (bonificação com frete) dividem igual', async () => {
    const { allocateCents } = await import('@/lib/stock/rules');
    expect(allocateCents(1_000, [0, 0])).toEqual([500, 500]);
  });
  it('parcelas: centavo que sobra vai para as primeiras', async () => {
    const { splitInstallments } = await import('@/lib/stock/rules');
    expect(splitInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(splitInstallments(500, 1)).toEqual([500]);
  });
});

describe('validação do recebimento', () => {
  it('chave de acesso: 44 dígitos (pontuação ignorada) ou vazia', async () => {
    const { ReceiptDraftSchema } = await import('@/lib/validations/stock');
    const key = '3526 1012 3456 7800 0199 5500 1000 0012 3410 0012 3456'; // 44 dígitos
    expect(ReceiptDraftSchema.safeParse({ invoiceKey: key }).success).toBe(true);
    expect(ReceiptDraftSchema.safeParse({ invoiceKey: key.slice(0, -1) }).success).toBe(false); // 43
    expect(ReceiptDraftSchema.parse({ invoiceKey: key }).invoiceKey).toHaveLength(44);
    expect(ReceiptDraftSchema.safeParse({ invoiceKey: '' }).success).toBe(true);
  });
});
