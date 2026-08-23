import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';
import { ownsPatient, ownsUser, ownsStage } from '@/lib/api/ownership';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { findLossReason, listLossReasons } from '@/lib/crm/loss-reasons';

// Campos editáveis de um deal (todos opcionais).
const UpdateDealInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  valueEstimated: z.number().positive().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'PHONE', 'WHATSAPP', 'SOCIAL_MEDIA', 'WALK_IN', 'EMAIL', 'OTHER']).optional(),
  stageId: z.string().optional(),
  patientId: z.string().optional().nullable(),
  responsibleUserId: z.string().optional(),
  nextFollowUpAt: z.string().optional().nullable(),
  lastContactAt: z.string().optional().nullable(),
  // Só é lido quando a etapa de destino é final de PERDA.
  lossReasonId: z.string().optional().nullable(),
  // Ignorado: o pipeline é derivado da etapa, não aceito do cliente (etapa e
  // pipeline divergentes deixariam o cartão fora de qualquer coluna).
  pipelineId: z.string().optional().nullable(),
});

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

// GET /api/crm/deals/[id]
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'view');
    if (denied) return denied;

    const deal = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const [patient, responsibleUser, activities] = await Promise.all([
      deal.patientId ? prisma.patient.findUnique({ where: { id: deal.patientId }, select: { id: true, name: true, phone: true } }) : null,
      prisma.user.findUnique({ where: { id: deal.responsibleUserId }, select: { id: true, name: true } }),
      prisma.dealActivity.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    return NextResponse.json({ ...deal, patient, responsibleUser, activities });
  } catch (err) {
    console.error('Erro ao buscar deal:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT/PATCH /api/crm/deals/[id]
async function updateHandler(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'crm', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const d = UpdateDealInputSchema.parse(await request.json());

    // FKs alterados precisam pertencer à empresa (etapa/responsável/paciente).
    if (!(await ownsStage(dbUser!.companyId, d.stageId)) ||
        !(await ownsUser(dbUser!.companyId, d.responsibleUserId)) ||
        !(await ownsPatient(dbUser!.companyId, d.patientId || null))) {
      return NextResponse.json({ error: 'Etapa, responsável ou paciente inválidos' }, { status: 400 });
    }

    // Etapa nova redefine o DESFECHO do negócio — e o formulário tem a etapa
    // "Perdido" no select, então esta era a porta por onde se dava perdido sem
    // motivo, driblando a trava do Kanban e da conversa.
    let stage: { id: string; pipelineId: string; name: string; finalType: string } | null = null;
    let loss: { id: string; name: string } | null = null;
    if (d.stageId && d.stageId !== existing.stageId) {
      stage = await prisma.pipelineStage.findFirst({
        where: { id: d.stageId, companyId: dbUser!.companyId },
        select: { id: true, pipelineId: true, name: true, finalType: true },
      });
      if (!stage) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

      if (stage.finalType === 'LOST') {
        loss = d.lossReasonId ? await findLossReason(dbUser!.companyId, d.lossReasonId) : null;
        if (!loss) {
          return NextResponse.json(
            {
              error: d.lossReasonId ? 'Motivo de perda inválido' : 'Escolha o motivo da perda',
              needsLossReason: true,
              reasons: await listLossReasons(dbUser!.companyId),
            },
            { status: 400 }
          );
        }
      }
    }

    const deal = await prisma.deal.update({
      where: { id: params.id },
      data: {
        ...(stage && {
          // Pipeline vem da etapa: é a única combinação que existe de verdade.
          pipelineId: stage.pipelineId,
          ...(stage.finalType === 'WON' && { status: 'WON' as const, wonAt: new Date(), lostAt: null, lossReasonId: null }),
          ...(stage.finalType === 'LOST' && { status: 'LOST' as const, lostAt: new Date(), wonAt: null, lossReasonId: loss!.id }),
          ...(stage.finalType === 'NONE' &&
            (existing.status === 'WON' || existing.status === 'LOST')
            ? { status: 'NEW' as const, wonAt: null, lostAt: null, lossReasonId: null }
            : {}),
        }),
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.valueEstimated !== undefined && { valueEstimated: d.valueEstimated ?? null }),
        ...(d.priority !== undefined && { priority: d.priority }),
        ...(d.source !== undefined && { source: d.source }),
        ...(d.stageId !== undefined && { stageId: d.stageId }),
        ...(d.patientId !== undefined && { patientId: d.patientId || null }),
        ...(d.responsibleUserId !== undefined && { responsibleUserId: d.responsibleUserId }),
        ...(d.nextFollowUpAt !== undefined && { nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null }),
        ...(d.lastContactAt !== undefined && { lastContactAt: d.lastContactAt ? new Date(d.lastContactAt) : null }),
      },
    });

    // Rastro da mudança de etapa feita pelo formulário — antes só o Kanban
    // registrava, e o histórico ficava com buracos.
    if (stage) {
      await prisma.dealActivity.create({
        data: {
          type: 'MOVED_STAGE',
          title: 'Etapa alterada',
          description: `Deal movido para "${stage.name}" por ${dbUser!.name}${loss ? ` — motivo: ${loss.name}` : ''}`,
          companyId: dbUser!.companyId,
          dealId: deal.id,
          authorId: dbUser!.id,
        },
      });
    }

    return NextResponse.json(deal);
  } catch (err) {
    console.error('Erro ao atualizar deal:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export const PUT = updateHandler;
export const PATCH = updateHandler;

// DELETE /api/crm/deals/[id] - soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'crm', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    await prisma.deal.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir deal:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
