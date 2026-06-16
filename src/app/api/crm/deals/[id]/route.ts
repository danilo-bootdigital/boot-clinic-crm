import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@prisma/client';

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
});

async function resolveDbUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };
  return { dbUser };
}

// GET /api/crm/deals/[id]
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

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

    const allowedRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.RECEPTION, UserRole.ATTENDANCE];
    if (!allowedRoles.includes(dbUser!.role)) {
      return NextResponse.json({ error: 'Sem permissão para editar deals' }, { status: 403 });
    }

    const existing = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const d = UpdateDealInputSchema.parse(await request.json());

    const deal = await prisma.deal.update({
      where: { id: params.id },
      data: {
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

    const allowedRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER];
    if (!allowedRoles.includes(dbUser!.role)) {
      return NextResponse.json({ error: 'Sem permissão para excluir deals' }, { status: 403 });
    }

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
