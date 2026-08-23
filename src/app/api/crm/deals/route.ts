import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';
import { CreateDealSchema } from '@/lib/validations/crm';
import { ownsPatient, ownsUser } from '@/lib/api/ownership';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { findLossReason, listLossReasons } from '@/lib/crm/loss-reasons';

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

// GET /api/crm/deals - Lista deals (array) com filtros, enriquecidos com paciente/responsável
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'view');
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const where: any = { companyId: dbUser!.companyId, deletedAt: null };
    if (sp.get('pipelineId')) where.pipelineId = sp.get('pipelineId');
    if (sp.get('responsibleUserId')) where.responsibleUserId = sp.get('responsibleUserId');
    if (sp.get('source')) where.source = sp.get('source');
    if (sp.get('status')) where.status = sp.get('status');
    const search = sp.get('search');
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const deals = await prisma.deal.findMany({ where, orderBy: { updatedAt: 'desc' } });

    // Enriquecimento manual (sem relações Prisma). Tudo em lote, por id: o cartão
    // do Kanban precisa de contato, conversa, paciente, responsável e motivo de
    // perda, e uma consulta por cartão faria N+1 num funil de centenas de leads.
    const patientIds = Array.from(new Set(deals.map((d) => d.patientId).filter(Boolean) as string[]));
    const userIds = Array.from(new Set(deals.map((d) => d.responsibleUserId)));
    const contactIds = Array.from(new Set(deals.map((d) => d.contactId).filter(Boolean) as string[]));
    const reasonIds = Array.from(new Set(deals.map((d) => d.lossReasonId).filter(Boolean) as string[]));

    const [users, contacts, conversations, reasons] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      contactIds.length
        ? prisma.contact.findMany({
            where: { id: { in: contactIds }, companyId: dbUser!.companyId },
            select: { id: true, name: true, phone: true, patientId: true },
          })
        : Promise.resolve([]),
      // Conversa por contato: é o que liga o cartão de volta ao atendimento.
      // Sem isto o CRM é um beco sem saída — o lead veio do WhatsApp e não há
      // caminho de volta para ler o que foi conversado.
      contactIds.length
        ? prisma.conversation.findMany({
            where: { companyId: dbUser!.companyId, contactId: { in: contactIds }, deletedAt: null },
            orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            select: { id: true, contactId: true, channel: true, lastMessageAt: true, unreadCount: true },
          })
        : Promise.resolve([]),
      // Sem filtrar removidos: motivo aposentado depois da perda continua sendo o
      // motivo daquela perda.
      reasonIds.length
        ? prisma.dealLossReason.findMany({
            where: { id: { in: reasonIds }, companyId: dbUser!.companyId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    // Pacientes só depois dos contatos: o vínculo com paciente pode vir do deal
    // OU do contato da mensageria, e buscar em paralelo perderia o segundo caso.
    const contactPatientIds = contacts.map((c) => c.patientId).filter(Boolean) as string[];
    const allPatientIds = Array.from(new Set([...patientIds, ...contactPatientIds]));
    const patients = allPatientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: allPatientIds }, companyId: dbUser!.companyId },
          select: { id: true, name: true, phone: true },
        })
      : [];

    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const contactMap = new Map(contacts.map((c) => [c.id, c]));
    const reasonMap = new Map(reasons.map((r) => [r.id, r]));
    // Primeira conversa de cada contato = a mais recente (a query já vem ordenada).
    const convMap = new Map<string, (typeof conversations)[number]>();
    for (const c of conversations) if (!convMap.has(c.contactId)) convMap.set(c.contactId, c);

    const enriched = deals.map((d) => {
      const contact = d.contactId ? contactMap.get(d.contactId) ?? null : null;
      // Paciente pode estar ligado no deal OU só no contato da mensageria —
      // o botão "Paciente" precisa funcionar nos dois casos.
      const patientId = d.patientId ?? contact?.patientId ?? null;
      const conversation = d.contactId ? convMap.get(d.contactId) ?? null : null;
      return {
        ...d,
        patient: patientId ? patientMap.get(patientId) ?? null : null,
        patientId,
        responsibleUser: userMap.get(d.responsibleUserId) ?? null,
        contact,
        conversation,
        lossReason: d.lossReasonId ? reasonMap.get(d.lossReasonId) ?? null : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('Erro ao listar deals:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/crm/deals - Cria um deal
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'crm', 'edit');
    if (forbidden) return forbidden;

    const body = await request.json();
    const data = CreateDealSchema.parse(body);

    // Valida que pipeline e etapa pertencem à empresa.
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: data.stageId, pipelineId: data.pipelineId, companyId: dbUser!.companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa/pipeline inválidos' }, { status: 400 });

    // Nascer direto na etapa "Perdido" também é dar perdido: exige motivo, como
    // em todos os outros caminhos.
    let loss: { id: string; name: string } | null = null;
    if (stage.finalType === 'LOST') {
      loss = data.lossReasonId ? await findLossReason(dbUser!.companyId, data.lossReasonId) : null;
      if (!loss) {
        return NextResponse.json(
          {
            error: data.lossReasonId ? 'Motivo de perda inválido' : 'Escolha o motivo da perda',
            needsLossReason: true,
            reasons: await listLossReasons(dbUser!.companyId),
          },
          { status: 400 }
        );
      }
    }

    // Paciente (opcional) e responsável precisam pertencer à empresa.
    if (!(await ownsPatient(dbUser!.companyId, data.patientId || null)) ||
        !(await ownsUser(dbUser!.companyId, data.responsibleUserId))) {
      return NextResponse.json({ error: 'Paciente ou responsável inválidos' }, { status: 400 });
    }

    const deal = await prisma.deal.create({
      data: {
        title: data.title,
        description: data.description || null,
        valueEstimated: data.valueEstimated ?? null,
        priority: data.priority,
        source: data.source,
        companyId: dbUser!.companyId,
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        patientId: data.patientId || null,
        responsibleUserId: data.responsibleUserId,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
        lastContactAt: data.lastContactAt ? new Date(data.lastContactAt) : null,
        // Reflete a etapa final no status, se aplicável.
        status: stage.finalType === 'WON' ? 'WON' : stage.finalType === 'LOST' ? 'LOST' : 'NEW',
        ...(stage.finalType === 'WON' && { wonAt: new Date() }),
        ...(stage.finalType === 'LOST' && { lostAt: new Date(), lossReasonId: loss!.id }),
      },
    });

    await prisma.dealActivity.create({
      data: {
        type: 'CREATED',
        title: 'Deal criado',
        description: `Deal "${deal.title}" criado por ${dbUser!.name}`,
        companyId: dbUser!.companyId,
        dealId: deal.id,
        authorId: dbUser!.id,
      },
    });

    return NextResponse.json(deal, { status: 201 });
  } catch (err) {
    console.error('Erro ao criar deal:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
