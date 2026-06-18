import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, buildPatientLink, teleEvent } from '@/lib/api/telemedicine';
import { notifyTeleconsultation, type TeleNotifyEvent } from '@/lib/telemedicine/notify';

const Schema = z.object({
  event: z.enum(['CREATED', 'REMINDER_24H', 'REMINDER_1H', 'REMINDER_15M', 'STARTING', 'LATE', 'FOLLOW_UP']),
});

// POST /api/telemedicine/sessions/[id]/notify — reenvia link / lembrete por WhatsApp.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'view');
    if (error) return error;
    const { event } = Schema.parse(await request.json());

    const [room, patient] = await Promise.all([
      prisma.telemedicineRoom.findUnique({ where: { sessionId: session!.id } }),
      prisma.patient.findUnique({ where: { id: session!.patientId }, select: { name: true, phone: true, whatsapp: true } }),
    ]);
    if (!room) return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });

    const result = await notifyTeleconsultation(event as TeleNotifyEvent, {
      companyId: dbUser!.companyId, patientId: session!.patientId, sessionId: session!.id,
      phone: patient?.whatsapp || patient?.phone, patientName: patient?.name || 'Paciente',
      link: buildPatientLink(room.publicSlug), startAt: session!.scheduledAt, userId: dbUser!.id,
    });
    await teleEvent(session!.id, dbUser!.companyId, `NOTIFY_${event}`, { actorId: dbUser!.id, actorName: dbUser!.name });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao notificar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
