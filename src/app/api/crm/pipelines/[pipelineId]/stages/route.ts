import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';

// GET /api/crm/pipelines/[pipelineId]/stages - Etapas de um pipeline
export async function GET(_request: NextRequest, { params }: { params: { pipelineId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const blocked = await subscriptionBlock(dbUser);
    if (blocked) return blocked;
    const moduleOff = await requireModuleEnabled(dbUser, 'crm');
    if (moduleOff) return moduleOff;
    const denied = requirePermission(dbUser, 'crm', 'view');
    if (denied) return denied;

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

const CreateSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à etapa').max(40, 'Nome com até 40 caracteres'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').optional(),
});

// POST /api/crm/pipelines/[pipelineId]/stages - cria uma etapa em aberto.
//
// Entra no fim das etapas em aberto, ANTES de Fechado/Perdido: o funil lê da
// esquerda para a direita e desfecho é sempre a última coisa. Etapa final nova
// não é criada por aqui — o tipo (ganho/perda) é estrutural, ver o DELETE.
export async function POST(request: NextRequest, { params }: { params: { pipelineId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const blocked = await subscriptionBlock(dbUser);
    if (blocked) return blocked;
    const moduleOff = await requireModuleEnabled(dbUser, 'crm');
    if (moduleOff) return moduleOff;
    const denied = requirePermission(dbUser, 'crm', 'edit');
    if (denied) return denied;

    const companyId = dbUser.companyId;
    const d = CreateSchema.parse(await request.json());

    const pipeline = await prisma.pipeline.findFirst({
      where: { id: params.pipelineId, companyId, deletedAt: null },
    });
    if (!pipeline) return NextResponse.json({ error: 'Pipeline não encontrado' }, { status: 404 });

    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, companyId },
      orderBy: { order: 'asc' },
    });
    if (stages.some((s) => s.name.trim().toLowerCase() === d.name.toLowerCase())) {
      return NextResponse.json({ error: 'Já existe uma etapa com esse nome' }, { status: 409 });
    }

    const open = stages.filter((s) => s.finalType === 'NONE');
    const finals = stages.filter((s) => s.finalType !== 'NONE');
    const position = open.length + 1;

    const [created] = await prisma.$transaction([
      prisma.pipelineStage.create({
        data: {
          name: d.name,
          color: d.color ?? '#3B82F6',
          order: position,
          isFinal: false,
          finalType: 'NONE',
          pipelineId: pipeline.id,
          companyId,
        },
      }),
      // Renumera tudo: em aberto 1..n, a nova em n+1, finais depois dela.
      ...open.map((s, i) => prisma.pipelineStage.update({ where: { id: s.id }, data: { order: i + 1 } })),
      ...finals.map((s, i) =>
        prisma.pipelineStage.update({ where: { id: s.id }, data: { order: position + 1 + i } })
      ),
    ]);

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao criar etapa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
