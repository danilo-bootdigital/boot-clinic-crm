import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';

export const MODULES = ['patients', 'clinico', 'crm', 'agenda', 'followup', 'whatsapp', 'automacoes', 'dashboard', 'configuracoes'] as const;
export type ModuleKey = (typeof MODULES)[number];
export type PermLevel = 'none' | 'view' | 'edit';

export const MODULE_LABELS: Record<ModuleKey, string> = {
  patients: 'Pacientes',
  clinico: 'Clínico (Anamnese/Prontuário)',
  crm: 'CRM',
  agenda: 'Agenda',
  followup: 'Follow-up',
  whatsapp: 'WhatsApp',
  automacoes: 'Automações',
  dashboard: 'Dashboard',
  configuracoes: 'Configurações',
};

type U = { role: UserRole; permissions?: any };

// OWNER e SUPER_ADMIN têm acesso total (não dependem da matriz) — evita lockout.
function isFullAccess(role: UserRole) {
  return role === UserRole.OWNER || role === UserRole.SUPER_ADMIN;
}

// Permissões efetivas por módulo. Admin = tudo 'edit'; demais = a matriz salva (default 'none').
export function effectivePermissions(user: U): Record<ModuleKey, PermLevel> {
  const out = {} as Record<ModuleKey, PermLevel>;
  const full = isFullAccess(user.role);
  for (const m of MODULES) {
    let lvl: PermLevel = full ? 'edit' : 'none';
    if (!full && user.permissions && typeof user.permissions === 'object') {
      const v = user.permissions[m];
      if (v === 'view' || v === 'edit' || v === 'none') lvl = v;
    }
    out[m] = lvl;
  }
  return out;
}

export function hasPermission(user: U, module: ModuleKey, level: 'view' | 'edit') {
  const lvl = effectivePermissions(user)[module];
  return level === 'view' ? lvl === 'view' || lvl === 'edit' : lvl === 'edit';
}

// Devolve 403 se o usuário não tem o nível exigido no módulo; caso contrário null.
export function requirePermission(user: U, module: ModuleKey, level: 'view' | 'edit') {
  return hasPermission(user, module, level)
    ? null
    : NextResponse.json({ error: 'Sem permissão para este módulo' }, { status: 403 });
}

// Normaliza um objeto de permissões recebido do cliente (só chaves/valores válidos).
export function sanitizePermissions(input: any): Record<string, PermLevel> {
  const out: Record<string, PermLevel> = {};
  if (input && typeof input === 'object') {
    for (const m of MODULES) {
      const v = input[m];
      out[m] = v === 'view' || v === 'edit' ? v : 'none';
    }
  } else {
    for (const m of MODULES) out[m] = 'none';
  }
  return out;
}
