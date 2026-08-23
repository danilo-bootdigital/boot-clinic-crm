import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { runAutomations } from '@/lib/automations/engine';
import { findLossReason, listLossReasons } from '@/lib/crm/loss-reasons';

const MoveSchema = z.object({
  newStageId: z.string(),
  dealId: z.string().optional(),
  notes: z.string().optional(),
  /** Obrigatório quando a etapa de destino é final de PERDA. */
  lossReasonId: z.string().optional(),
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
    const moduleOff = await requireModuleEnabled(dbUser, 'crm');
    if (moduleOff) return moduleOff;
    const forbidden = requirePermission(dbUser, 'crm', 'edit');
    if (forbidden) return forbidden;

    const { newStageId, lossReasonId } = MoveSchema.parse(await request.json());

    const deal = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser.companyId, deletedAt: null },
    });
    if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const stage = await prisma.pipelineStage.findFirst({
      where: { id: newStageId, companyId: dbUser.companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

    // Perdido exige motivo. Sem isto o funil registra a perda e não o porquê — e
    // a resposta devolve a lista para a tela abrir o seletor em vez de só falhar.
    let loss: { id: string; name: string } | null = null;
    if (stage.finalType === 'LOST') {
      loss = lossReasonId ? await findLossReason(dbUser.companyId, lossReasonId) : null;
      if (!loss) {
        return NextResponse.json(
          {
            error: lossReasonId ? 'Motivo de perda inválido' : 'Escolha o motivo da perda',
            needsLossReason: true,
            reasons: await listLossReasons(dbUser.companyId),
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.deal.update({
      where: { id: params.id },
      data: {
        stageId: stage.id,
        pipelineId: stage.pipelineId,
        ...(stage.finalType === 'WON' && { status: 'WON', wonAt: new Date(), lostAt: null, lossReasonId: null }),
        ...(stage.finalType === 'LOST' && { status: 'LOST', lostAt: new Date(), wonAt: null, lossReasonId: loss!.id }),
        ...(stage.finalType === 'NONE' && {
          wonAt: null,
          lostAt: null,
          // Voltar de um desfecho final tem que desfazer o desfecho: só limpar as
          // datas deixava o negócio com status WON/LOST numa etapa em aberto —
          // fora do funil e ainda contado como perda no relatório. Move comum
          // entre etapas abertas não mexe no status.
          ...(deal.status === 'WON' || deal.status === 'LOST'
            ? { status: 'NEW' as const, lossReasonId: null }
            : {}),
        }),
      },
    });

    await prisma.dealActivity.create({
      data: {
        type: 'MOVED_STAGE',
        title: 'Etapa alterada',
        // O motivo entra na descrição: é o que a próxima pessoa a abrir o
        // histórico precisa ler, sem ter que cruzar id com cadastro.
        description: `Deal movido para "${stage.name}" por ${dbUser.name}${loss ? ` — motivo: ${loss.name}` : ''}`,
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
