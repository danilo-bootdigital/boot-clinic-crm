import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';
import { CreateDealSchema } from '@/lib/validations/crm';

async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };
  return { dbUser };
}

// GET /api/crm/deals - Lista deals (array) com filtros, enriquecidos com paciente/responsável
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

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

    // Enriquecimento manual (sem relações Prisma): paciente e responsável.
    const patientIds = Array.from(new Set(deals.map((d) => d.patientId).filter(Boolean) as string[]));
    const userIds = Array.from(new Set(deals.map((d) => d.responsibleUserId)));
    const [patients, users] = await Promise.all([
      patientIds.length
        ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true, phone: true } })
        : Promise.resolve([]),
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = deals.map((d) => ({
      ...d,
      patient: d.patientId ? patientMap.get(d.patientId) ?? null : null,
      responsibleUser: userMap.get(d.responsibleUserId) ?? null,
    }));

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

    const allowedRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTION, UserRole.ATTENDANCE];
    if (!allowedRoles.includes(dbUser!.role)) {
      return NextResponse.json({ error: 'Sem permissão para criar deals' }, { status: 403 });
    }

    const body = await request.json();
    const data = CreateDealSchema.parse(body);

    // Valida que pipeline e etapa pertencem à empresa.
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: data.stageId, pipelineId: data.pipelineId, companyId: dbUser!.companyId },
    });
    if (!stage) return NextResponse.json({ error: 'Etapa/pipeline inválidos' }, { status: 400 });

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
