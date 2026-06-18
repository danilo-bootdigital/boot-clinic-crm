// Capacidades do Módulo Financeiro — lógica PURA e client-safe (sem imports de
// servidor). Reusada pelo servidor (financial-access.ts) e pelo frontend, p/ que
// a regra de RBAC fique num único lugar.
//
// Regra aprovada (Danilo, 2026-06-18):
//  OWNER/MANAGER/FINANCE/SUPER_ADMIN → tudo.
//  RECEPTION → view, create, settle, receipt (sem reverse/cancel/delete/edit_paid).
//  DOCTOR → somente view.  MARKETING/ATTENDANCE → nada.

export type FinanceCapability =
  | 'view'
  | 'create'
  | 'settle'
  | 'receipt'
  | 'reverse'
  | 'cancel'
  | 'delete'
  | 'edit_paid';

const FULL_ACCESS = ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'FINANCE'];
const RECEPTION_CAPS: FinanceCapability[] = ['view', 'create', 'settle', 'receipt'];

export function financialCan(role: string | undefined | null, cap: FinanceCapability): boolean {
  if (!role) return false;
  if (FULL_ACCESS.includes(role)) return true;
  if (role === 'RECEPTION') return RECEPTION_CAPS.includes(cap);
  if (role === 'DOCTOR') return cap === 'view';
  return false;
}

export function financialModuleLevel(role: string | undefined | null): 'none' | 'view' | 'edit' {
  if (financialCan(role, 'create') || financialCan(role, 'settle')) return 'edit';
  if (financialCan(role, 'view')) return 'view';
  return 'none';
}

// --- Contas a Pagar (Fase 2) ---
// Despesa é gestão/financeiro. RECEPTION/DOCTOR/MARKETING/ATTENDANCE NÃO têm acesso
// (diverge de Contas a Receber, onde a recepção opera). Aprovado por Danilo.
export function payableCan(role: string | undefined | null, cap: FinanceCapability): boolean {
  if (!role) return false;
  return FULL_ACCESS.includes(role); // OWNER/MANAGER/FINANCE/SUPER_ADMIN têm tudo; demais nada.
}

export function payableModuleLevel(role: string | undefined | null): 'none' | 'view' | 'edit' {
  return FULL_ACCESS.includes(role || '') ? 'edit' : 'none';
}
