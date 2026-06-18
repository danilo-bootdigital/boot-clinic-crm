import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { subscriptionBlock } from '@/lib/api/session';
import { effectivePermissions, type PermLevel } from '@/lib/api/permissions';
import { requireModuleEnabled } from '@/lib/api/modules';
import { UserRole } from '@prisma/client';

// Áreas do Módulo Clínico Documental. O acesso é mais fino que o módulo único
// 'clinico' porque a LGPD/rotina exige separar dado sensível (prontuário) de
// dado administrativo (orçamento/contrato).
export type ClinicalArea =
  | 'anamnese'
  | 'prontuario'
  | 'contratos'
  | 'orcamentos'
  | 'imagens';

export const CLINICAL_AREAS: ClinicalArea[] = [
  'anamnese',
  'prontuario',
  'contratos',
  'orcamentos',
  'imagens',
];

// Matriz papel × área (apenas papéis com regra específica do enunciado).
// Papéis NÃO listados (ex.: ATTENDANCE) caem no nível do módulo genérico
// 'clinico' definido na matriz de permissões por usuário (Configurações).
// OWNER / MANAGER / SUPER_ADMIN têm acesso total (não passam por aqui).
const CLINICAL_MATRIX: Partial<Record<UserRole, Record<ClinicalArea, PermLevel>>> = {
  // Médico/Profissional: prontuário, anamnese e imagens (edição); vê contratos/orçamentos.
  DOCTOR: { anamnese: 'edit', prontuario: 'edit', imagens: 'edit', contratos: 'view', orcamentos: 'view' },
  // Recepção: cria anamnese e anexa documentos/imagens; NÃO edita evolução clínica (só visualiza prontuário).
  RECEPTION: { anamnese: 'edit', prontuario: 'view', imagens: 'edit', contratos: 'edit', orcamentos: 'edit' },
  // Financeiro: vê orçamento (e contrato), sem acesso a prontuário/anamnese/imagens clínicas.
  FINANCE: { anamnese: 'none', prontuario: 'none', imagens: 'none', contratos: 'view', orcamentos: 'view' },
  // Marketing: sem acesso a prontuário, contratos sensíveis e imagens clínicas.
  MARKETING: { anamnese: 'none', prontuario: 'none', imagens: 'none', contratos: 'none', orcamentos: 'none' },
};

const FULL_ACCESS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER];

type U = { role: UserRole; permissions?: any };

// Nível efetivo de um usuário numa área clínica.
export function clinicalAreaLevel(user: U, area: ClinicalArea): PermLevel {
  if (FULL_ACCESS.includes(user.role)) return 'edit';
  const matrix = CLINICAL_MATRIX[user.role];
  if (matrix) return matrix[area];
  // Papéis sem regra fixa: usam o nível do módulo genérico 'clinico'.
  return effectivePermissions(user).clinico;
}

// Maior nível entre todas as áreas — usado para gatear o menu/módulo 'clinico'
// no /api/me (um médico tem 'clinico' visível mesmo que a matriz salva diga 'none').
export function clinicalModuleLevel(user: U): PermLevel {
  let best: PermLevel = 'none';
  for (const a of CLINICAL_AREAS) {
    const lvl = clinicalAreaLevel(user, a);
    if (lvl === 'edit') return 'edit';
    if (lvl === 'view') best = 'view';
  }
  return best;
}

export function hasClinicalArea(user: U, area: ClinicalArea, level: 'view' | 'edit') {
  const lvl = clinicalAreaLevel(user, area);
  return level === 'view' ? lvl === 'view' || lvl === 'edit' : lvl === 'edit';
}

// 403 se o usuário não tem o nível exigido na área; senão null.
export function requireClinicalArea(user: U, area: ClinicalArea, level: 'view' | 'edit') {
  return hasClinicalArea(user, area, level)
    ? null
    : NextResponse.json({ error: 'Sem permissão para esta área clínica' }, { status: 403 });
}

// Resolve usuário + bloqueio de assinatura + acesso à área clínica (sem paciente).
// Usado nas rotas de catálogo (modelos de anamnese/contrato) e listas globais.
export async function resolveClinicalUser(area: ClinicalArea, level: 'view' | 'edit') {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: { select: { status: true, plan: true } } },
  });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  // Nível Clínica/SaaS: o módulo 'clinico' precisa estar habilitado para a clínica.
  const moduleOff = await requireModuleEnabled(dbUser, 'clinico');
  if (moduleOff) return { error: moduleOff };

  const denied = requireClinicalArea(dbUser, area, level);
  if (denied) return { error: denied };

  return { dbUser };
}

// Resolve usuário + acesso à área + posse do paciente (mesma empresa, não arquivado).
// Espelha resolvePatientAccess, mas usa a matriz clínica por área.
export async function resolveClinicalPatientAccess(
  patientId: string,
  area: ClinicalArea,
  level: 'view' | 'edit',
) {
  const { dbUser, error } = await resolveClinicalUser(area, level);
  if (error) return { error };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, companyId: dbUser!.companyId, deletedAt: null },
  });
  if (!patient) return { error: NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 }) };

  return { dbUser, patient };
}
