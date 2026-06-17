import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { runAutomations } from '@/lib/automations/engine';

const MoveSchema = z.object({
  newStageId: z.string(),
  dealId: z.string().optional(),
  notes: z.string().optional(),
});

// PATCH /api/crm/deals/[id]/move - move o deal para outra etapa (Kanban drag-and-drop).
// Se a etapa de destino for final (WON/LOST), reflete no status e marca wonAt/lostAt.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const blocked = await subscriptionBlock(dbUser);
    if (blocked) return blocked;
    const forbidden = requirePermission(dbUser, 'crm', 'edit');
    if (forbidden) return forbidden;

    const { newStageId } = MoveSchema.parse(await request.json());

    const deal = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser.companyId, deletedAt: null },
    });
    if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: newStageId, companyId: dbUser.companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

    const updated = await prisma.deal.update({
      where: { id: params.id },
      data: {
        stageId: stage.id,
        pipelineId: stage.pipelineId,
        ...(stage.finalType === 'WON' && { status: 'WON', wonAt: new Date(), lostAt: null }),
        ...(stage.finalType === 'LOST' && { status: 'LOST', lostAt: new Date(), wonAt: null }),
        ...(stage.finalType === 'NONE' && { wonAt: null, lostAt: null }),
      },
    });

    await prisma.dealActivity.create({
      data: {
        type: 'MOVED_STAGE',
        title: 'Etapa alterada',
        description: `Deal movido para "${stage.name}" por ${dbUser.name}`,
        companyId: dbUser.companyId,
        dealId: deal.id,
        authorId: dbUser.id,
      },
    });

    // Automação: oportunidade ganha ao mover para etapa final WON.
    if (stage.finalType === 'WON') {
      await runAutomations('DEAL_WON', { companyId: dbUser.companyId, dealId: deal.id, patientId: deal.patientId, summary: `Oportunidade ganha: ${updated.title}` });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Erro ao mover deal:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
