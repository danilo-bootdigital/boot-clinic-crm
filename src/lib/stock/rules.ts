// Regras PURAS do estoque (sem banco) — testáveis isoladamente.
// Desenho: docs/DIRETRIZ_MODULO_ESTOQUE.md §5.

import { isExpired } from '@/lib/stock-caps';

// Custo médio ponderado (§5.7), por unidade base. Saldo total ≤ 0 = o custo da
// própria entrada vira o custo médio (não herda média de estoque zerado).
export function weightedAvgCost(totalQty: number, avgCost: number, inQty: number, inCost: number): number {
  if (inQty <= 0) return avgCost;
  if (totalQty <= 0) return inCost;
  return (totalQty * avgCost + inQty * inCost) / (totalQty + inQty);
}

// Estorno de uma ENTRADA retira q ao custo c: desfaz a média. Se o estoque
// zera (ou ficaria negativo), mantém a média atual — não há mais o que pesar.
export function avgCostAfterRemoving(totalQty: number, avgCost: number, outQty: number, outCost: number): number {
  const rest = totalQty - outQty;
  if (rest <= 0) return avgCost;
  return Math.max(0, (totalQty * avgCost - outQty * outCost) / rest);
}

// Tipos de saída que aceitam lote vencido/bloqueado: perda, devolução ao
// fornecedor, ajustes, estorno e transferência (mover p/ quarentena é legítimo).
const EXIT_ANY_LOT = new Set([
  'PERDA', 'DEVOLUCAO_FORNECEDOR', 'AJUSTE_MANUAL', 'AJUSTE_INVENTARIO', 'ESTORNO', 'TRANSFERENCIA_SAIDA',
]);

// §5.5/§5.6: lote vencido só sai como perda; lote fora de LIBERADO não sai por
// consumo/venda. Devolve o motivo do bloqueio, ou null se pode sair.
export function exitBlockReason(
  type: string,
  lot: { lotNumber: string; status: string; expiresAt: Date | string | null },
  now: Date = new Date(),
): string | null {
  if (EXIT_ANY_LOT.has(type)) return null;
  if (lot.status !== 'LIBERADO') {
    return `O lote ${lot.lotNumber} está ${lot.status.toLowerCase()} e não pode ser usado. Só sai como perda ou devolução ao fornecedor.`;
  }
  if (isExpired(lot.expiresAt, now)) {
    return `O lote ${lot.lotNumber} está vencido. Lote vencido só sai como perda.`;
  }
  return null;
}

export type FefoCandidate = {
  lotId: string;
  quantity: number;
  lot: { lotNumber: string; status: string; expiresAt: Date | string | null; createdAt: Date | string };
};

// FEFO (§5.4): entre os lotes LIBERADOS e não vencidos do local, o de menor
// validade com saldo suficiente (sem validade vai por último; empate = mais antigo).
export function pickFefoLot(candidates: FefoCandidate[], qty: number, now: Date = new Date()): FefoCandidate | null {
  const usable = candidates
    .filter((c) => c.quantity >= qty && c.lot.status === 'LIBERADO' && !isExpired(c.lot.expiresAt, now))
    .sort((a, b) => {
      const ea = a.lot.expiresAt ? new Date(a.lot.expiresAt).getTime() : Infinity;
      const eb = b.lot.expiresAt ? new Date(b.lot.expiresAt).getTime() : Infinity;
      if (ea !== eb) return ea - eb;
      return new Date(a.lot.createdAt).getTime() - new Date(b.lot.createdAt).getTime();
    });
  return usable[0] ?? null;
}

// §5.12: item refrigerado/congelado indo para local de outra temperatura exige
// confirmação explícita de quem movimenta.
export function needsTemperatureConfirm(itemTemp: string, locationTemp: string): boolean {
  return itemTemp !== 'AMBIENTE' && itemTemp !== locationTemp;
}

// Arredonda para a precisão das colunas (qty 4 casas, custo unitário 6, total 2).
export const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
};
