import { UserRole } from '@prisma/client';
import { ADMIN_ROLES } from '@/lib/api/session';

// Regras de posse por registro do módulo Tarefas — camada ADICIONAL sobre a
// permissão de módulo existente (followup:view/edit via requirePermission).
// Não é um sistema de permissões paralelo: só decide, dentro de quem já tem
// acesso ao módulo, o que cada papel pode fazer com UMA tarefa específica.
//
// Regras (CLAUDE.md do pedido, seção 21):
// - Usuário comum: vê/edita as próprias tarefas (criou OU é responsável),
//   conclui as que lhe foram atribuídas.
// - Gestão/Admin (SUPER_ADMIN/OWNER/MANAGER): vê a equipe toda, reatribui
//   para qualquer usuário da clínica, cancela.

export type TaskAccessUser = { id: string; role: UserRole };
export type TaskAccessRecord = { createdById: string; assignedToId: string | null };

export function isTaskAdmin(role: UserRole): boolean {
  return (ADMIN_ROLES as UserRole[]).includes(role);
}

/** Dono do registro: criou a tarefa ou é o responsável atual por ela. */
function isOwner(user: TaskAccessUser, task: TaskAccessRecord): boolean {
  return task.createdById === user.id || task.assignedToId === user.id;
}

/** Edição de campos gerais (título, descrição, prazo, prioridade, categoria, vínculos). */
export function canEditTask(user: TaskAccessUser, task: TaskAccessRecord): boolean {
  return isTaskAdmin(user.role) || isOwner(user, task);
}

/** Trocar o responsável para OUTRA pessoa. */
export function canReassignTask(user: TaskAccessUser, task: TaskAccessRecord): boolean {
  return isTaskAdmin(user.role) || task.createdById === user.id;
}

/** Concluir (contato feito / feito). */
export function canCompleteTask(user: TaskAccessUser, task: TaskAccessRecord): boolean {
  return isTaskAdmin(user.role) || isOwner(user, task);
}

/** Cancelar — reservado à gestão (spec explícita: só Gestão/Admin cancela). */
export function canCancelTask(user: TaskAccessUser, _task: TaskAccessRecord): boolean {
  return isTaskAdmin(user.role);
}

/** Excluir (remoção definitiva/soft-delete) — reservado à gestão. */
export function canDeleteTask(user: TaskAccessUser, _task: TaskAccessRecord): boolean {
  return isTaskAdmin(user.role);
}

/** Ver todas as tarefas da clínica (não só as próprias). */
export function canViewAllTasks(role: UserRole): boolean {
  return isTaskAdmin(role);
}
