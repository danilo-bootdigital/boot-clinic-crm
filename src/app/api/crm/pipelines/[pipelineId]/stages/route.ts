import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';

// GET /api/crm/pipelines/[pipelineId]/stages - Etapas de um pipeline
export async function GET(_request: NextRequest, { params }: { params: { pipelineId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

    // Garante que o pipeline pertence à empresa do usuário.
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: params.pipelineId, companyId: dbUser.companyId, deletedAt: null },
    });
    if (!pipeline) return NextResponse.json({ error: 'Pipeline não encontrado' }, { status: 404 });

    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, companyId: dbUser.companyId },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json(stages);
  } catch (err) {
    console.error('Erro ao listar etapas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
