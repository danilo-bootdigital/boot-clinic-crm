import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const Schema = z.object({ isActive: z.boolean().optional(), name: z.string().min(1).optional() });

// PUT /api/automacoes/rules/[id] - ativa/desativa ou renomeia.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('automacoes');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'automacoes', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.automationRule.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });

    const d = Schema.parse(await request.json());
    const rule = await prisma.automationRule.update({
      where: { id: params.id },
      data: { ...(d.isActive !== undefined && { isActive: d.isActive }), ...(d.name !== undefined && { name: d.name }) },
    });
    return NextResponse.json(rule);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar automação:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/automacoes/rules/[id] - remove a regra (e gatilhos/ações).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('automacoes');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'automacoes', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.automationRule.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });

    await prisma.automationTrigger.deleteMany({ where: { ruleId: params.id, companyId: dbUser!.companyId } });
    await prisma.automationAction.deleteMany({ where: { ruleId: params.id, companyId: dbUser!.companyId } });
    await prisma.automationRule.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover automação:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
