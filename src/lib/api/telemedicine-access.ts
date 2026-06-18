import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { effectivePermissions } from '@/lib/api/permissions';

// Ações do módulo Telemedicina. Mais fino que o módulo único 'telemedicina'
// porque o enunciado separa quem AGENDA (recepção) de quem ATENDE (médico) e de
// quem NÃO entra na sala (financeiro/marketing). Espelha lib/api/clinical-access.
//   - schedule : criar/cancelar/reagendar teleconsulta (gancho da Agenda)
//   - attend   : atuar como médico na sala + registrar prontuário/encerrar
//   - join_room: entrar na sala de vídeo (médico/staff autorizado)
//   - view     : ver lista, KPIs e detalhes (sem entrar na sala)
export type TelemedicineAction = 'schedule' | 'attend' | 'join_room' | 'view';

export const TELEMEDICINE_ACTIONS: TelemedicineAction[] = ['schedule', 'attend', 'join_room', 'view'];

type Caps = Record<TelemedicineAction, boolean>;

const NONE: Caps = { schedule: false, attend: false, join_room: false, view: false };
const FULL: Caps = { schedule: true, attend: true, join_room: true, view: true };

// Matriz papel → capacidades. OWNER/MANAGER/SUPER_ADMIN têm tudo (não passam aqui).
// Papéis sem regra fixa caem no nível do módulo genérico 'telemedicina' (Configurações).
const TELE_MATRIX: Partial<Record<UserRole, Caps>> = {
  // Médico: atende, entra na sala, vê — mas o agendamento é função da recepção.
  DOCTOR: { schedule: false, attend: true, join_room: true, view: true },
  // Recepção: agenda e acompanha; não atua clinicamente nem entra na sala.
  RECEPTION: { schedule: true, attend: false, join_room: false, view: true },
  // Atendimento: agenda e acompanha (mesma régua de recepção).
  ATTENDANCE: { schedule: true, attend: false, join_room: false, view: true },
  // Financeiro: vê indicadores/consultas, NUNCA entra na sala.
  FINANCE: { schedule: false, attend: false, join_room: false, view: true },
  // Marketing: sem acesso à sala/dado clínico (só consome dashboard agregado, se liberado no módulo).
  MARKETING: NONE,
};

const FULL_ACCESS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER];

type U = { role: UserRole; permissions?: any };

export function telemedicineCaps(user: U): Caps {
  if (FULL_ACCESS.includes(user.role)) return FULL;
  const fixed = TELE_MATRIX[user.role];
  if (fixed) return fixed;
  // Papéis sem regra fixa: derivam do nível do módulo 'telemedicina' salvo no RBAC.
  const lvl = effectivePermissions(user).telemedicina;
  if (lvl === 'edit') return FULL;
  if (lvl === 'view') return { schedule: false, attend: false, join_room: false, view: true };
  return NONE;
}

export function canTelemedicine(user: U, action: TelemedicineAction): boolean {
  return telemedicineCaps(user)[action];
}

// Maior visibilidade do módulo p/ gatear o menu no /api/me (médico vê o menu
// mesmo sem permissão genérica salva, pois 'view' vem da matriz).
export function telemedicineModuleVisible(user: U): boolean {
  return telemedicineCaps(user).view;
}

// 403 se o usuário não pode executar a ação; senão null.
export function requireTelemedicine(user: U, action: TelemedicineAction) {
  return canTelemedicine(user, action)
    ? null
    : NextResponse.json({ error: 'Sem permissão para esta ação de telemedicina' }, { status: 403 });
}
