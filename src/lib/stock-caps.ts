// Capacidades do Módulo Estoque — lógica PURA e client-safe (sem imports de
// servidor). Reusada pelo servidor (api/stock-access.ts) e pelo frontend, p/ que
// a regra de RBAC fique num único lugar. Desenho: docs/DIRETRIZ_MODULO_ESTOQUE.md §7.
//
// Regra aprovada (Danilo, 2026-10-08):
//  OWNER/MANAGER/SUPER_ADMIN → tudo.
//  FINANCE   → view, view_cost, receive, purchase, approve_purchase, sell.
//  DOCTOR    → view, consume, controlled (só nos próprios atendimentos — Fase 3).
//              NUNCA view_cost: o médico não vê custo de nada (campos removidos no servidor).
//  RECEPTION → view, consume, receive, transfer, count, sell.
//  MARKETING/ATTENDANCE → nada.

export type StockCapability =
  | 'view'
  | 'view_cost'
  | 'consume'
  | 'receive'
  | 'transfer'
  | 'adjust'
  | 'count'
  | 'approve_count'
  | 'purchase'
  | 'approve_purchase'
  | 'manage'
  | 'controlled'
  | 'sell';

const FULL_ACCESS = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];

const ROLE_CAPS: Record<string, StockCapability[]> = {
  FINANCE: ['view', 'view_cost', 'receive', 'purchase', 'approve_purchase', 'sell'],
  DOCTOR: ['view', 'consume', 'controlled'],
  RECEPTION: ['view', 'consume', 'receive', 'transfer', 'count', 'sell'],
};

export function stockCan(role: string | undefined | null, cap: StockCapability): boolean {
  if (!role) return false;
  if (FULL_ACCESS.includes(role)) return true;
  return ROLE_CAPS[role]?.includes(cap) ?? false;
}

// Ajuste, perda e estorno de item CONTROLADO: só gestão (§5.11), além de `adjust`.
export function isStockManager(role: string | undefined | null): boolean {
  return FULL_ACCESS.includes(role || '');
}

export function stockModuleLevel(role: string | undefined | null): 'none' | 'view' | 'edit' {
  if (stockCan(role, 'manage') || stockCan(role, 'consume') || stockCan(role, 'receive')) return 'edit';
  if (stockCan(role, 'view')) return 'view';
  return 'none';
}

// Rótulos client-safe usados nas telas e no razão.
export const MOVEMENT_LABELS: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada (compra)',
  ENTRADA_AVULSA: 'Entrada avulsa',
  ENTRADA_BONIFICACAO: 'Bonificação',
  ENTRADA_DEVOLUCAO: 'Devolução ao estoque',
  CONSUMO_ATENDIMENTO: 'Consumo em atendimento',
  CONSUMO_INTERNO: 'Consumo interno',
  VENDA: 'Venda',
  PERDA: 'Perda',
  DEVOLUCAO_FORNECEDOR: 'Devolução ao fornecedor',
  TRANSFERENCIA_SAIDA: 'Transferência (saída)',
  TRANSFERENCIA_ENTRADA: 'Transferência (entrada)',
  AJUSTE_INVENTARIO: 'Ajuste de inventário',
  AJUSTE_MANUAL: 'Ajuste manual',
  ESTORNO: 'Estorno',
};

export const ITEM_KIND_LABELS: Record<string, string> = {
  INSUMO: 'Insumo',
  MEDICAMENTO: 'Medicamento',
  INJETAVEL: 'Injetável',
  DESCARTAVEL: 'Descartável',
  REVENDA: 'Revenda',
  USO_INTERNO: 'Uso interno',
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  ALMOXARIFADO: 'Almoxarifado',
  SALA: 'Sala',
  GELADEIRA: 'Geladeira',
  CARRINHO: 'Carrinho',
  OUTRO: 'Outro',
};

export const STORAGE_TEMP_LABELS: Record<string, string> = {
  AMBIENTE: 'Ambiente',
  REFRIGERADO: 'Refrigerado',
  CONGELADO: 'Congelado',
};

export const LOT_STATUS_LABELS: Record<string, string> = {
  LIBERADO: 'Liberado',
  QUARENTENA: 'Quarentena',
  BLOQUEADO: 'Bloqueado',
  RECOLHIDO: 'Recolhido',
};

export const LOSS_REASONS = ['VENCIMENTO', 'QUEBRA', 'CONTAMINACAO', 'TEMPERATURA', 'OUTRO'] as const;
export const LOSS_REASON_LABELS: Record<string, string> = {
  VENCIMENTO: 'Vencimento',
  QUEBRA: 'Quebra',
  CONTAMINACAO: 'Contaminação',
  TEMPERATURA: 'Falha de temperatura',
  OUTRO: 'Outro',
};

export const CONTROLLED_LISTS = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5'] as const;

// Situação de reposição do item a partir do saldo total (unidade base).
export type StockStatus = 'ok' | 'repor' | 'critico' | 'zerado';
export function stockStatus(total: number, minQty?: number | null, reorderPoint?: number | null): StockStatus {
  if (total <= 0) return 'zerado';
  if (minQty != null && total <= minQty) return 'critico';
  if (reorderPoint != null && total <= reorderPoint) return 'repor';
  return 'ok';
}

// "Vencido" é DERIVADO (expiresAt < agora), sem cron — mesmo padrão de Tarefas.
export function isExpired(expiresAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < now.getTime();
}
