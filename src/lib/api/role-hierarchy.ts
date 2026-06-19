// Hierarquia de papéis (correção SEC1). Lógica PURA e client-safe (sem imports
// de servidor) — reusada pelo backend (rotas de /api/users) e pela UI, para que
// a regra fique num único lugar. A segurança obrigatória vive no backend; a UI
// apenas espelha (defesa adicional).
//
// OPÇÃO A (aprovada): o ator precisa de nível ESTRITAMENTE SUPERIOR ao alvo —
// nunca igual, nunca inferior. SUPER_ADMIN gerencia todos e pode criar SUPER_ADMIN.

export const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 4,
  OWNER: 3,
  MANAGER: 2,
  DOCTOR: 1,
  RECEPTION: 1,
  FINANCE: 1,
  MARKETING: 1,
  ATTENDANCE: 1,
};

// Rank do papel; 0 para papel desconhecido/ausente (fail-closed).
export function getRoleRank(role: string | null | undefined): number {
  return (role && ROLE_RANK[role]) || 0;
}

// O ator pode GERENCIAR (editar / excluir / redefinir senha) um alvo com targetRole?
// SUPER_ADMIN gerencia todos. Demais: rank do ator estritamente maior que o do alvo.
// (OWNER não gerencia OWNER; MANAGER não gerencia MANAGER; etc.)
export function canManageTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  return getRoleRank(actorRole) > getRoleRank(targetRole);
}

// O ator pode ATRIBUIR (criar/promover para) o papel newRole?
// SUPER_ADMIN atribui qualquer papel (inclusive SUPER_ADMIN). Demais: o novo papel
// precisa ter rank estritamente menor que o do ator (nunca igual/superior; e como
// SUPER_ADMIN=4 é o topo, ninguém além de SUPER_ADMIN consegue atribuí-lo).
export function canAssignRole(actorRole: string, newRole: string): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  return getRoleRank(newRole) < getRoleRank(actorRole);
}

// Lista de papéis que o ator pode atribuir (para popular selects na UI).
export function assignableRoles(actorRole: string): string[] {
  return Object.keys(ROLE_RANK).filter((r) => canAssignRole(actorRole, r));
}
