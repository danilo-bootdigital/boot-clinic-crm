import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// ============================================================================
// CONTROLE SaaS MODULAR — 3 níveis de habilitação de um módulo:
//   1) SaaS/plano  → PlanFeature (plano contrata o módulo)
//   2) Clínica     → CompanyModule (clínica ativou o módulo)
//   3) Usuário     → RBAC (lib/api/permissions) — tratado nas rotas/permissões
//
// Regra de OURO (backward-compatible): SEM dados configurados, tudo é habilitado.
//   - Sem PlanFeature para o plano   → o plano contrata todos os módulos.
//   - Sem CompanyModule para a chave  → o módulo está ativo na clínica.
//   - Módulo `isCore`                 → sempre habilitado (evita lockout).
// ============================================================================

export interface ModuleDef {
  key: string;
  label: string;
  isCore: boolean;   // sempre habilitado, não desligável
  available: boolean; // já construído (false = preparado p/ o futuro)
  order: number;
}

// Catálogo (fonte de verdade em código; semeado no banco para ser administrável).
// Os `key` dos módulos JÁ construídos casam com lib/api/permissions.MODULES.
export const MODULE_CATALOG: ModuleDef[] = [
  { key: 'dashboard',     label: 'Dashboard',      isCore: true,  available: true,  order: 0 },
  { key: 'patients',      label: 'Pacientes',      isCore: false, available: true,  order: 1 },
  { key: 'clinico',       label: 'Clínico',        isCore: false, available: true,  order: 2 },
  { key: 'crm',           label: 'CRM',            isCore: false, available: true,  order: 3 },
  { key: 'agenda',        label: 'Agenda',         isCore: false, available: true,  order: 4 },
  { key: 'whatsapp',      label: 'WhatsApp',       isCore: false, available: true,  order: 5 },
  { key: 'followup',      label: 'Follow-up',      isCore: false, available: true,  order: 6 },
  { key: 'automacoes',    label: 'Automações',     isCore: false, available: true,  order: 7 },
  { key: 'configuracoes', label: 'Configurações',  isCore: true,  available: true,  order: 8 },
  // Telemedicina — módulo construído (centro de atendimento remoto integrado).
  { key: 'telemedicina',  label: 'Telemedicina',   isCore: false, available: true,  order: 9 },
  // Futuros (preparados — sem rotas ainda; entram no menu quando construídos).
  { key: 'financeiro',           label: 'Financeiro',            isCore: false, available: false, order: 21 },
  { key: 'ia',                   label: 'IA',                    isCore: false, available: false, order: 22 },
  { key: 'portal-paciente',      label: 'Portal do Paciente',    isCore: false, available: false, order: 23 },
  { key: 'relatorios-avancados', label: 'Relatórios Avançados',  isCore: false, available: false, order: 24 },
  { key: 'integracoes-premium',  label: 'Integrações Premium',   isCore: false, available: false, order: 25 },
];

const CATALOG_BY_KEY = new Map(MODULE_CATALOG.map((m) => [m.key, m]));

// Garante que o catálogo existe no banco (idempotente). Roda só uma vez por
// processo — mesmo padrão de auto-seed dos outros módulos (pipelines/specialties).
let catalogSeeded = false;
export async function ensureModuleCatalog() {
  if (catalogSeeded) return;
  await Promise.all(
    MODULE_CATALOG.map((m) =>
      prisma.module.upsert({
        where: { key: m.key },
        update: { label: m.label, isCore: m.isCore, available: m.available, order: m.order },
        create: { key: m.key, label: m.label, isCore: m.isCore, available: m.available, order: m.order },
      }),
    ),
  );
  catalogSeeded = true;
}

// Conjunto de módulos habilitados (entre os disponíveis) para uma clínica.
export async function getEnabledModules(company: { id: string; plan?: string | null }): Promise<Set<string>> {
  const [companyModules, planFeatures] = await Promise.all([
    prisma.companyModule.findMany({ where: { companyId: company.id }, select: { moduleKey: true, enabled: true } }),
    company.plan
      ? prisma.planFeature.findMany({ where: { plan: company.plan }, select: { moduleKey: true } })
      : Promise.resolve([] as { moduleKey: string }[]),
  ]);

  const compMap = new Map(companyModules.map((c) => [c.moduleKey, c.enabled]));
  // Se o plano não tem mapeamento nenhum, contrata tudo (backward-compat).
  const planSet = company.plan && planFeatures.length > 0 ? new Set(planFeatures.map((p) => p.moduleKey)) : null;

  const enabled = new Set<string>();
  for (const m of MODULE_CATALOG) {
    if (!m.available) continue;
    if (m.isCore) { enabled.add(m.key); continue; }
    const planContracts = planSet === null ? true : planSet.has(m.key);
    const clinicActive = compMap.has(m.key) ? compMap.get(m.key)! : true;
    if (planContracts && clinicActive) enabled.add(m.key);
  }
  return enabled;
}

export async function isModuleEnabled(company: { id: string; plan?: string | null }, key: string): Promise<boolean> {
  const def = CATALOG_BY_KEY.get(key);
  if (def?.isCore) return true;
  if (def && !def.available) return false;
  return (await getEnabledModules(company)).has(key);
}

// 403 se o módulo não está habilitado para a clínica do usuário; senão null.
// Fecha o acesso direto por URL às APIs de um módulo desligado/não-contratado.
export async function requireModuleEnabled(
  dbUser: { companyId: string; company?: { plan?: string | null } | null },
  key: string,
) {
  const def = CATALOG_BY_KEY.get(key);
  if (def?.isCore) return null;
  let plan = dbUser.company?.plan;
  if (plan === undefined) {
    const c = await prisma.company.findUnique({ where: { id: dbUser.companyId }, select: { plan: true } });
    plan = c?.plan ?? null;
  }
  const enabled = await isModuleEnabled({ id: dbUser.companyId, plan }, key);
  return enabled
    ? null
    : NextResponse.json({ error: 'Módulo não disponível para esta clínica', code: 'MODULE_DISABLED' }, { status: 403 });
}
