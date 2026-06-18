import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { MODULE_CATALOG, ensureModuleCatalog, getEnabledModules } from '@/lib/api/modules';

// /api/admin/companies/[id]/modules - controle de módulos por clínica (SUPER_ADMIN).
// Nível Clínica do controle SaaS modular (liga/desliga módulo para a clínica).

// GET - catálogo com estado efetivo (habilitado) e override da clínica.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null }, select: { id: true, plan: true } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    await ensureModuleCatalog();
    const [enabled, overrides] = await Promise.all([
      getEnabledModules(company),
      prisma.companyModule.findMany({ where: { companyId: company.id }, select: { moduleKey: true, enabled: true } }),
    ]);
    const ovMap = new Map(overrides.map((o) => [o.moduleKey, o.enabled]));

    const modules = MODULE_CATALOG.map((m) => ({
      key: m.key,
      label: m.label,
      isCore: m.isCore,
      available: m.available,
      enabled: enabled.has(m.key) || m.isCore,
      // override explícito da clínica (null = sem override → segue default/plano)
      override: ovMap.has(m.key) ? ovMap.get(m.key)! : null,
    }));
    return NextResponse.json({ plan: company.plan, modules });
  } catch (err) {
    console.error('Erro ao listar módulos da clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

const PutSchema = z.object({
  moduleKey: z.string().min(1),
  enabled: z.boolean(),
});

// PUT - liga/desliga um módulo para a clínica (upsert do override).
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null }, select: { id: true } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const { moduleKey, enabled } = PutSchema.parse(await request.json());
    const def = MODULE_CATALOG.find((m) => m.key === moduleKey);
    if (!def) return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 });
    if (def.isCore && !enabled) return NextResponse.json({ error: 'Módulo essencial não pode ser desativado' }, { status: 400 });

    await prisma.companyModule.upsert({
      where: { companyId_moduleKey: { companyId: company.id, moduleKey } },
      update: { enabled },
      create: { companyId: company.id, moduleKey, enabled },
    });
    return NextResponse.json({ success: true, moduleKey, enabled });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar módulo da clínica:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
