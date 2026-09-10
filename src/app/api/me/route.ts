import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { effectivePermissions } from '@/lib/api/permissions';
import { clinicalModuleLevel } from '@/lib/api/clinical-access';
import { telemedicineModuleVisible } from '@/lib/api/telemedicine-access';
import { financialModuleLevel } from '@/lib/api/financial-access';
import { ensureModuleCatalog, getEnabledModules } from '@/lib/api/modules';
import { brTodayStart } from '@/lib/followup/dates';

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
      // Financeiro: nível vem da matriz papel×capacidade (FINANCE/RECEPTION veem
      // o menu mesmo sem permissão genérica salva). 'edit' se cria/baixa.
      financeiro: financialModuleLevel(dbUser!.role),
    };
    // Módulos habilitados para a clínica (nível SaaS + nível Clínica).
    await ensureModuleCatalog();
    const enabled = await getEnabledModules({ id: dbUser!.companyId, plan: dbUser!.company?.plan });

    // Badge do menu (Tarefas atrasadas atribuídas a mim) — uma contagem indexada
    // a mais nesta mesma resposta, já buscada uma vez por carregamento da
    // sidebar; não uma rota nova nem uma consulta por render do menu.
    let tasksOverdueCount = 0;
    if (enabled.has('followup') && permissions.followup !== 'none') {
      tasksOverdueCount = await prisma.followUpTask.count({
        where: {
          companyId: dbUser!.companyId,
          deletedAt: null,
          assignedToId: dbUser!.id,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: brTodayStart() },
        },
      });
    }

    return NextResponse.json({
      id: dbUser!.id,
      name: dbUser!.name,
      email: dbUser!.email,
      role: dbUser!.role,
      permissions,
      modules: Array.from(enabled),
      tasksOverdueCount,
      // Identidade visual da clínica logada (para a sidebar). Sempre da empresa
      // do usuário autenticado — nunca de outra clínica.
      company: { name: dbUser!.company?.name ?? null, logo: dbUser!.company?.logo ?? null },
    });
  } catch (err) {
    console.error('Erro ao buscar usuário atual:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
