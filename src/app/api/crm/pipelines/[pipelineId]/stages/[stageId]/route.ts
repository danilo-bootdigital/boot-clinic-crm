import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';

const DeleteSchema = z.object({
  /** Etapa que recebe os negócios da etapa excluída. Obrigatória se houver negócios. */
  moveToStageId: z.string().min(1).optional(),
});

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Dê um nome à etapa').max(40, 'Nome com até 40 caracteres').optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').optional(),
  })
  .refine((d) => d.name !== undefined || d.color !== undefined, 'Nada para alterar');

// PATCH /api/crm/pipelines/[pipelineId]/stages/[stageId] - renomeia / troca a cor.
//
// Vale também para Fechado/Perdido: o que o sistema usa é o `finalType`, não o
// nome — renomear "Fechado" para "Ganho" não muda nenhum comportamento. O tipo
// em si não é editável por aqui.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { pipelineId: string; stageId: string } }
) {
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
    const d = UpdateSchema.parse(await request.json());

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: params.stageId, pipelineId: params.pipelineId, companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });

    if (d.name !== undefined) {
      const siblings = await prisma.pipelineStage.findMany({
        where: { pipelineId: stage.pipelineId, companyId },
      });
      const clash = siblings.some(
        (s) => s.id !== stage.id && s.name.trim().toLowerCase() === d.name!.toLowerCase()
      );
      if (clash) return NextResponse.json({ error: 'Já existe uma etapa com esse nome' }, { status: 409 });
    }

    const updated = await prisma.pipelineStage.update({
      where: { id: stage.id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.color !== undefined && { color: d.color }),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao editar etapa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/crm/pipelines/[pipelineId]/stages/[stageId] - exclui uma etapa do funil.
//
// Travas, cada uma protegendo algo que o resto do CRM assume:
// - Etapas finais (Fechado/Perdido) não saem: é pelo `finalType` que o
//   movimento marca ganho/perda, a mensageria acha o "Perdido" e o resumo conta
//   conversão. Sem elas o funil para de registrar desfecho.
// - Sobra pelo menos uma etapa em aberto: é onde nasce o negócio novo.
// - Etapa com negócios exige destino em aberto. Apagar levando os negócios junto
//   deixaria `Deal.stageId` órfão (FK escalar, sem cascade) e o cartão sumiria
//   do quadro sem sumir do relatório. Destino final não vale: entrar em Perdido
//   pede motivo um a um, e isso é o arraste no quadro que faz.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { pipelineId: string; stageId: string } }
) {
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
    const { moveToStageId } = DeleteSchema.parse(await request.json().catch(() => ({})));

    const pipeline = await prisma.pipeline.findFirst({
      where: { id: params.pipelineId, companyId, deletedAt: null },
    });
    if (!pipeline) return NextResponse.json({ error: 'Pipeline não encontrado' }, { status: 404 });

    const stages = await prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, companyId },
      orderBy: { order: 'asc' },
    });
    const stage = stages.find((s) => s.id === params.stageId);
    if (!stage) return NextResponse.json({ error: 'Etapa não encontrada' }, { status: 404 });

    if (stage.finalType !== 'NONE') {
      return NextResponse.json(
        { error: 'Etapas de desfecho (Fechado/Perdido) não podem ser excluídas — o funil usa elas para registrar ganho e perda.' },
        { status: 400 }
      );
    }
    const openStages = stages.filter((s) => s.finalType === 'NONE');
    if (openStages.length <= 1) {
      return NextResponse.json(
        { error: 'O funil precisa de pelo menos uma etapa em aberto.' },
        { status: 400 }
      );
    }

    const dealCount = await prisma.deal.count({
      where: { companyId, stageId: stage.id, deletedAt: null },
    });

    let target: (typeof stages)[number] | null = null;
    if (dealCount > 0) {
      if (!moveToStageId) {
        return NextResponse.json(
          {
            error: `Esta etapa tem ${dealCount} negócio${dealCount > 1 ? 's' : ''}. Escolha para qual etapa ${dealCount > 1 ? 'eles vão' : 'ele vai'}.`,
            needsTarget: true,
            dealCount,
          },
          { status: 409 }
        );
      }
      target = openStages.find((s) => s.id === moveToStageId && s.id !== stage.id) ?? null;
      if (!target) {
        return NextResponse.json({ error: 'Etapa de destino inválida' }, { status: 400 });
      }
    }

    const remaining = stages.filter((s) => s.id !== stage.id);
    await prisma.$transaction([
      // Inclui negócios na lixeira: restaurados, voltariam apontando para o nada.
      ...(target
        ? [prisma.deal.updateMany({ where: { companyId, stageId: stage.id }, data: { stageId: target.id } })]
        : []),
      prisma.pipelineStage.delete({ where: { id: stage.id } }),
      // Reordena sem buraco: a ordem é o que o quadro e o funil exibem.
      ...remaining.map((s, i) =>
        prisma.pipelineStage.update({ where: { id: s.id }, data: { order: i + 1 } })
      ),
    ]);

    return NextResponse.json({
      deleted: { id: stage.id, name: stage.name },
      movedDeals: target ? dealCount : 0,
      movedTo: target ? { id: target.id, name: target.name } : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao excluir etapa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
