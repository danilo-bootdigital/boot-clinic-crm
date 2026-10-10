import type { UserRole } from '@prisma/client';

// Papéis de gestão que podem, por opção explícita, também atender como médico(a).
export const DOCTOR_CAPABLE_MANAGER_ROLES: readonly UserRole[] = ['OWNER', 'MANAGER'];

/**
 * A conta atende como médico(a)? Papel DOCTOR, ou gestor (OWNER/MANAGER) com
 * `attendsAsDoctor` ligado — ex.: a médica que também gerencia a clínica.
 * Um usuário tem um único papel; o flag evita escolher entre agenda e gestão.
 */
export function atendeComoMedico(u: { role: UserRole; attendsAsDoctor?: boolean | null }): boolean {
  if (u.role === 'DOCTOR') return true;
  return !!u.attendsAsDoctor && DOCTOR_CAPABLE_MANAGER_ROLES.includes(u.role);
}

/**
 * O cadastro de Médico(a) da agenda aceita duas situações:
 *
 * - **sem conta de acesso**: médico cadastrado à mão, que não faz login;
 * - **com conta de acesso**: só entra se a conta atende como médico(a)
 *   (papel DOCTOR, ou gestor com `attendsAsDoctor`).
 *
 * Existe porque o GET de profissionais criava um registro com o nome de QUEM
 * ABRISSE A TELA — foi assim que donos de clínica (OWNER) e um SUPER_ADMIN
 * viraram "médicos" da agenda. A auto-criação foi removida; este predicado é a
 * defesa em profundidade, e o teste dele trava a regra.
 */
export function isMedico(p: {
  userId?: string | null;
  user?: { role: UserRole; attendsAsDoctor?: boolean | null } | null;
}): boolean {
  if (!p.userId) return true;
  return !!p.user && atendeComoMedico(p.user);
}
