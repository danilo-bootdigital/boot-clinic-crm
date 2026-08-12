import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Channel, DealSource, DealStatus, MessageEntryPoint, Priority } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { CHANNEL_LABEL, dealSourceFor } from '@/lib/messaging/conversion';

// Conversão conversa → oportunidade no CRM (diretriz §5, Fase 4).
//
// GET  — contexto para o botão: contato, etapas do pipeline, etapa sugerida e se
//        já existe oportunidade aberta para este contato.
// POST — cria o Deal ligado ao Contact, na etapa escolhida.
//
// `Deal.patientId` é opcional, então esta ação NÃO exige que o contato seja
// paciente — é justamente o caminho que funciona para DM de rede social.

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  stageId: z.string().min(1, 'Etapa é obrigatória'),
  pipelineId: z.string().min(1).optional(),
  title: z.string().min(1).max(180).optional(),
  valueEstimated: z.preprocess(
    (v) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    z.coerce.number().positive().optional()
  ),
  priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
  responsibleUserId: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  /** Criar mesmo já havendo oportunidade aberta para o contato. */
  force: z.boolean().default(false),
});

async function loadConversation(id: string, companyId: string) {
  return prisma.conversation.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      contact: { select: { id: true, name: true, phone: true, patientId: true } },
      account: { select: { id: true, label: true } },
    },
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

    // Pipeline padrão da clínica (ou o primeiro), com as etapas na ordem.
    const pipeline = await prisma.pipeline.findFirst({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { order: 'asc' }],
    });
    const stages = pipeline
      ? await prisma.pipelineStage.findMany({
          where: { pipelineId: pipeline.id, companyId: dbUser!.companyId },
          orderBy: { order: 'asc' },
        })
      : [];

    // Já existe oportunidade em aberto? Evita criar deal repetido a cada clique.
    const existing = await prisma.deal.findFirst({
      where: {
        companyId: dbUser!.companyId,
        contactId: conv.contactId,
        deletedAt: null,
        status: { notIn: [DealStatus.WON, DealStatus.LOST] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, stageId: true, status: true, createdAt: true },
    });

    return NextResponse.json({
      contact: conv.contact,
      channel: conv.channel,
      entryPoint: conv.entryPoint,
      suggested: {
        // Sugestões, não imposições: a tela pré-preenche e o usuário ajusta.
        title: `${conv.contact.name} — ${CHANNEL_LABEL[conv.channel]}`,
        stageId: stages[0]?.id ?? null,
        source: dealSourceFor(conv.channel, conv.entryPoint),
        responsibleUserId: dbUser!.id,
      },
      pipeline: pipeline ? { id: pipeline.id, name: pipeline.name } : null,
      stages: stages.map((s) => ({ id: s.id, name: s.name, color: s.color, order: s.order })),
      existingDeal: existing,
    });
  } catch (err) {
    console.error('Erro ao montar contexto de conversão:', err);
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

    const d = CreateSchema.parse(await request.json());

    // A etapa tem que ser da própria clínica — nunca confia no id do cliente.
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: d.stageId, companyId: dbUser!.companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

    if (d.pipelineId && d.pipelineId !== stage.pipelineId) {
      return NextResponse.json({ error: 'Etapa não pertence ao pipeline informado' }, { status: 400 });
    }

    if (!d.force) {
      const existing = await prisma.deal.findFirst({
        where: {
          companyId: dbUser!.companyId,
          contactId: conv.contactId,
          deletedAt: null,
          status: { notIn: [DealStatus.WON, DealStatus.LOST] },
        },
        select: { id: true, title: true, status: true },
      });
      if (existing) {
        // 409 com o deal existente: a tela oferece abrir o que já existe ou
        // insistir com force. Criar em silêncio encheria o funil de duplicatas.
        return NextResponse.json(
          { error: 'Este contato já tem oportunidade em aberto', existingDeal: existing },
          { status: 409 }
        );
      }
    }

    // Responsável: precisa ser usuário da própria clínica.
    let responsibleUserId = dbUser!.id;
    if (d.responsibleUserId && d.responsibleUserId !== dbUser!.id) {
      const owner = await prisma.user.findFirst({
        where: { id: d.responsibleUserId, companyId: dbUser!.companyId, deletedAt: null },
        select: { id: true },
      });
      if (!owner) return NextResponse.json({ error: 'Responsável inválido' }, { status: 400 });
      responsibleUserId = owner.id;
    }

    const deal = await prisma.deal.create({
      data: {
        companyId: dbUser!.companyId,
        title: d.title?.trim() || `${conv.contact.name} — ${CHANNEL_LABEL[conv.channel]}`,
        description: d.description?.trim() || null,
        valueEstimated: d.valueEstimated ?? null,
        priority: d.priority,
        status: DealStatus.NEW,
        // Origem derivada do canal — não é escolha do usuário (§5).
        source: dealSourceFor(conv.channel, conv.entryPoint),
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        contactId: conv.contactId,
        // Se o contato já é paciente, o deal nasce ligado a ele também.
        patientId: conv.contact.patientId ?? null,
        responsibleUserId,
        lastContactAt: conv.lastMessageAt ?? new Date(),
      },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.CREATE,
      entityType: EntityType.DEAL,
      entityId: deal.id,
      newValues: {
        origem: 'mensageria',
        conversationId: conv.id,
        contactId: conv.contactId,
        canal: conv.channel,
        etapa: stage.name,
        source: deal.source,
      },
      request,
    });

    return NextResponse.json(
      {
        deal: {
          id: deal.id,
          title: deal.title,
          stageId: deal.stageId,
          stageName: stage.name,
          source: deal.source,
          valueEstimated: deal.valueEstimated,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao criar oportunidade a partir da conversa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
