import type { UserRole } from '@prisma/client';

/**
 * O cadastro de Médico(a) da agenda aceita duas situações:
 *
 * - **sem conta de acesso**: médico cadastrado à mão, que não faz login;
 * - **com conta de acesso**: só entra se o papel for DOCTOR.
 *
 * Existe porque o GET de profissionais criava um registro com o nome de QUEM
 * ABRISSE A TELA — foi assim que donos de clínica (OWNER) e um SUPER_ADMIN
 * viraram "médicos" da agenda. A auto-criação foi removida; este predicado é a
 * defesa em profundidade, e o teste dele trava a regra.
 */
export function isMedico(p: { userId?: string | null; user?: { role: UserRole } | null }): boolean {
  if (!p.userId) return true;
  return p.user?.role === 'DOCTOR';
}
