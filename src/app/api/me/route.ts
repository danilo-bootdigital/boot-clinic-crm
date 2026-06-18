import { NextResponse } from 'next/server';
import { resolveDbUser } from '@/lib/api/session';
import { effectivePermissions } from '@/lib/api/permissions';
import { clinicalModuleLevel } from '@/lib/api/clinical-access';
import { telemedicineModuleVisible } from '@/lib/api/telemedicine-access';
import { ensureModuleCatalog, getEnabledModules } from '@/lib/api/modules';

// GET /api/me - usuário atual + permissões efetivas por módulo + módulos habilitados
// na clínica (para o frontend gatear menu/botões respeitando plano + ativação + RBAC).
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    // O nível do módulo 'clinico' vem da matriz clínica por área (um médico vê
    // o menu mesmo sem permissão genérica salva), não da matriz simples salva.
    const permissions = {
      ...effectivePermissions(dbUser!),
      clinico: clinicalModuleLevel(dbUser!),
      // Telemedicina: visibilidade vem da matriz papel×ação (um médico vê o menu
      // mesmo sem permissão genérica salva). 'edit' se pode atender, senão 'view'.
      telemedicina: telemedicineModuleVisible(dbUser!) ? 'edit' : 'none',
    };
    // Módulos habilitados para a clínica (nível SaaS + nível Clínica).
    await ensureModuleCatalog();
    const enabled = await getEnabledModules({ id: dbUser!.companyId, plan: dbUser!.company?.plan });
    return NextResponse.json({
      id: dbUser!.id,
      name: dbUser!.name,
      email: dbUser!.email,
      role: dbUser!.role,
      permissions,
      modules: Array.from(enabled),
    });
  } catch (err) {
    console.error('Erro ao buscar usuário atual:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
