import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DealStatus, Priority } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { CHANNEL_LABEL, dealSourceFor } from '@/lib/messaging/conversion';
import { findLossReason, listLossReasons } from '@/lib/crm/loss-reasons';

// Dar o lead como PERDIDO de dentro da conversa (diretriz §5).
//
// A atendente descobre o motivo falando, não abrindo o CRM: se o perdido só
// existisse no Kanban, ela fecharia a conversa e a perda nunca seria registrada.
//
// GET  — contexto: motivos cadastrados e o negócio aberto deste contato (se houver).
// POST — marca o negócio como perdido com o motivo escolhido. Sem negócio no
//        funil, CRIA já perdido: perda de quem nunca entrou no funil também é
//        perda, e some do relatório se depender de alguém ter clicado antes.

export const dynamic = 'force-dynamic';

const LostSchema = z.object({
  lossReasonId: z.string().min(1, 'Motivo é obrigatório'),
  notes: z.string().trim().max(2000).optional(),
});

function loadConversation(id: string, companyId: string) {
  return prisma.conversation.findFirst({
    where: { id, companyId, deletedAt: null },
    include: { contact: { select: { id: true, name: true, phone: true, patientId: true } } },
  });
}

/** Negócio aberto do contato — o candidato natural a virar perdido. */
function openDealFor(companyId: string, contactId: string) {
  return prisma.deal.findFirst({
    where: {
      companyId,
      contactId,
      deletedAt: null,
      status: { notIn: [DealStatus.WON, DealStatus.LOST] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true, stageId: true, patientId: true },
  });
}

/** Etapa final de perda do pipeline padrão — onde o negócio perdido deve parar. */
async function lostStage(companyId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { companyId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
    select: { id: true },
  });
  if (!pipeline) return null;
  return prisma.pipelineStage.findFirst({
    where: { companyId, pipelineId: pipeline.id, finalType: 'LOST' },
    orderBy: { order: 'asc' },
    select: { id: true, pipelineId: true, name: true },
  });
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'view');
    if (denied) return denied;

    const conv = await loadConversation(params.id, dbUser!.companyId);
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const [reasons, deal, lost] = await Promise.all([
      listLossReasons(dbUser!.companyId),
      openDealFor(dbUser!.companyId, conv.contactId),
      lostStage(dbUser!.companyId),
    ]);

    // Já perdido antes? A tela mostra o desfecho em vez de oferecer o botão de novo.
    const alreadyLost = deal
      ? null
      : await prisma.deal.findFirst({
          where: { companyId: dbUser!.companyId, contactId: conv.contactId, deletedAt: null, status: DealStatus.LOST },
          orderBy: { lostAt: 'desc' },
          select: { id: true, title: true, lostAt: true, lossReasonId: true },
        });

    return NextResponse.json({
      contact: conv.contact,
      channel: conv.channel,
      reasons,
      openDeal: deal,
      lostDeal: alreadyLost
        ? {
            ...alreadyLost,
            // Busca SEM filtrar removidos: motivo aposentado depois da perda
            // continua sendo o motivo daquela perda.
            reasonName: alreadyLost.lossReasonId
              ? (
                  await prisma.dealLossReason.findFirst({
                    where: { id: alreadyLost.lossReasonId, companyId: dbUser!.companyId },
                    select: { name: true },
                  })
                )?.name ?? null
              : null,
          }
        : null,
      // Sem etapa final de perda no pipeline, o negócio ainda vira LOST por
      // status — a tela avisa para alguém arrumar o pipeline.
      hasLostStage: !!lost,
    });
  } catch (err) {
    console.error('Erro ao montar contexto de perda:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'edit');
    if (denied) return denied;

    const conv = await loadConversation(params.id, dbUser!.companyId);
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const d = LostSchema.parse(await request.json());
    const reason = await findLossReason(dbUser!.companyId, d.lossReasonId);
    if (!reason) {
      return NextResponse.json(
        { error: 'Motivo de perda inválido', reasons: await listLossReasons(dbUser!.companyId) },
        { status: 400 }
      );
    }

    const [open, lost] = await Promise.all([
      openDealFor(dbUser!.companyId, conv.contactId),
      lostStage(dbUser!.companyId),
    ]);
    const now = new Date();

    const deal = open
      ? await prisma.deal.update({
          where: { id: open.id },
          data: {
            status: DealStatus.LOST,
            lostAt: now,
            wonAt: null,
            lossReasonId: reason.id,
            ...(lost ? { stageId: lost.id, pipelineId: lost.pipelineId } : {}),
          },
        })
      : await prisma.deal.create({
          data: {
            companyId: dbUser!.companyId,
            title: `${conv.contact.name} — ${CHANNEL_LABEL[conv.channel]}`,
            status: DealStatus.LOST,
            lostAt: now,
            lossReasonId: reason.id,
            // Origem derivada do canal — não é escolha do usuário (§5).
            source: dealSourceFor(conv.channel, conv.entryPoint),
            priority: Priority.MEDIUM,
            ...(lost ? { stageId: lost.id, pipelineId: lost.pipelineId } : {}),
            contactId: conv.contactId,
            patientId: conv.contact.patientId ?? null,
            responsibleUserId: dbUser!.id,
            lastContactAt: conv.lastMessageAt ?? now,
          },
        });

    await prisma.dealActivity.create({
      data: {
        type: 'MOVED_STAGE',
        title: open ? 'Oportunidade perdida' : 'Perda registrada pela conversa',
        description: `Motivo: ${reason.name}${d.notes ? ` — ${d.notes}` : ''} (por ${dbUser!.name})`,
        companyId: dbUser!.companyId,
        dealId: deal.id,
        authorId: dbUser!.id,
      },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE_STATUS,
      entityType: EntityType.DEAL,
      entityId: deal.id,
      oldValues: open ? { status: open.status } : { status: 'inexistente (criado já perdido)' },
      newValues: {
        status: DealStatus.LOST,
        motivo: reason.name,
        origem: 'mensageria',
        conversationId: conv.id,
        contactId: conv.contactId,
      },
      request,
    });

    return NextResponse.json({
      deal: { id: deal.id, title: deal.title, status: deal.status, lostAt: deal.lostAt },
      reason,
      created: !open,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao dar oportunidade como perdida:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
