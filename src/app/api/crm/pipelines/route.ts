import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { getDefaultStages } from '@/lib/validations/crm';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';

const DEFAULT_LOSS_REASONS = ['Preço', 'Sem retorno', 'Escolheu concorrente', 'Sem interesse', 'Outro'];

// Resolve o usuário do banco a partir da sessão Supabase.
async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };
  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };
  const moduleOff = await requireModuleEnabled(dbUser, 'crm');
  if (moduleOff) return { error: moduleOff };
  return { dbUser };
}

// Garante que a empresa tenha um pipeline padrão com etapas e motivos de perda.
async function ensureDefaults(companyId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { companyId, deletedAt: null },
  });
  if (existing) return;

  const pipeline = await prisma.pipeline.create({
    data: { name: 'Pipeline Padrão', isDefault: true, companyId, order: 0 },
  });

  await prisma.pipelineStage.createMany({
    data: getDefaultStages().map((s) => ({
      name: s.name,
      order: s.order,
      color: s.color,
      isFinal: s.isFinal,
      finalType: s.finalType,
      pipelineId: pipeline.id,
      companyId,
    })),
  });

  const reasonsCount = await prisma.dealLossReason.count({ where: { companyId } });
  if (reasonsCount === 0) {
    await prisma.dealLossReason.createMany({
      data: DEFAULT_LOSS_REASONS.map((name) => ({ name, companyId })),
    });
  }
}

// GET /api/crm/pipelines - Lista pipelines da empresa (cria o padrão se não existir)
export async function GET(_request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'view');
    if (denied) return denied;

    await ensureDefaults(dbUser!.companyId);

    const pipelines = await prisma.pipeline.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json(pipelines);
  } catch (err) {
    console.error('Erro ao listar pipelines:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
