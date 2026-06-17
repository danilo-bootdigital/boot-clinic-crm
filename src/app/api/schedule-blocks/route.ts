import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireRole, STAFF_ROLES } from '@/lib/api/session';
import { ownsProfessional } from '@/lib/api/ownership';

const Schema = z.object({
  professionalId: z.string().min(1),
  date: z.string().min(1), // YYYY-MM-DD
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  reason: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.string().optional(),
});

function serialize(b: any) {
  return { ...b, date: b.date instanceof Date ? b.date.toISOString().split('T')[0] : b.date };
}

// GET /api/schedule-blocks?professionalId=
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const where: any = { companyId: dbUser!.companyId, deletedAt: null };
    const pid = request.nextUrl.searchParams.get('professionalId');
    if (pid) where.professionalId = pid;

    const items = await prisma.scheduleBlock.findMany({ where, orderBy: { date: 'desc' } });
    return NextResponse.json(items.map(serialize));
  } catch (err) {
    console.error('Erro ao listar bloqueios:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/schedule-blocks
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireRole(dbUser!, STAFF_ROLES);
    if (forbidden) return forbidden;
    const data = Schema.parse(await request.json());

    // Profissional do bloqueio precisa pertencer à empresa.
    if (!(await ownsProfessional(dbUser!.companyId, data.professionalId))) {
      return NextResponse.json({ error: 'Profissional inválido' }, { status: 400 });
    }

    const item = await prisma.scheduleBlock.create({
      data: {
        professionalId: data.professionalId,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason || null,
        isRecurring: data.isRecurring ?? false,
        recurringPattern: data.recurringPattern || null,
        companyId: dbUser!.companyId,
      },
    });
    return NextResponse.json(serialize(item), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar bloqueio:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
