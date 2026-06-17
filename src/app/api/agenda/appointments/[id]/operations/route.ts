import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { findAppointmentConflict } from '@/lib/api/appointments';

const Schema = z.object({
  action: z.enum(['confirm', 'attend', 'no_show', 'cancel', 'reschedule']),
  cancellationReason: z.string().optional(),
  newStartAt: z.string().optional(),
  newDurationMinutes: z.coerce.number().min(5).max(480).optional(),
});

// PATCH /api/agenda/appointments/[id]/operations - workflow de status
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const existing = await prisma.appointment.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    const body = Schema.parse(await request.json());
    const now = new Date();
    let data: any = {};

    switch (body.action) {
      case 'confirm':
        data = { status: 'CONFIRMED', confirmedAt: now };
        break;
      case 'attend':
        data = { status: 'ATTENDED', attendedAt: now };
        break;
      case 'no_show':
        data = { status: 'NO_SHOW', noShowAt: now };
        break;
      case 'cancel':
        data = { status: 'CANCELED', canceledAt: now, cancellationReason: body.cancellationReason || null };
        break;
      case 'reschedule': {
        if (!body.newStartAt) return NextResponse.json({ error: 'Nova data/hora é obrigatória' }, { status: 400 });
        const startAt = new Date(body.newStartAt);
        const duration = body.newDurationMinutes ?? existing.durationMinutes;
        const endAt = new Date(startAt.getTime() + duration * 60000);
        const conflict = await findAppointmentConflict({
          companyId: dbUser!.companyId,
          professionalId: existing.professionalId,
          startAt,
          endAt,
          excludeId: params.id,
        });
        if (conflict) return NextResponse.json({ error: 'Conflito de horário para este profissional' }, { status: 409 });
        data = { status: 'PENDING', startAt, endAt, durationMinutes: duration };
        break;
      }
    }

    const appt = await prisma.appointment.update({ where: { id: params.id }, data });

    await prisma.appointmentStatusHistory.create({
      data: { appointmentId: appt.id, status: appt.status, changedById: dbUser!.id, notes: body.cancellationReason || null },
    }).catch(() => {});

    return NextResponse.json(appt);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro na operação do agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
