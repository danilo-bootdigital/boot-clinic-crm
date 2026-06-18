import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, canTransition, timestampsFor, teleEvent } from '@/lib/api/telemedicine';
import { writeAudit } from '@/lib/api/audit';
import { runAutomations } from '@/lib/automations/engine';
import { TelemedicineStatus, AppointmentStatus } from '@prisma/client';

const Schema = z.object({
  status: z.enum([
    'AGENDADA', 'AGUARDANDO_PACIENTE', 'PACIENTE_ENTROU', 'MEDICO_ENTROU',
    'EM_ATENDIMENTO', 'PAUSADA', 'FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU',
  ]),
  reason: z.string().optional(),
});

// Mapeia o status da teleconsulta de volta para o status do Appointment (Agenda).
const APPT_STATUS: Partial<Record<TelemedicineStatus, AppointmentStatus>> = {
  FINALIZADA: 'ATTENDED',
  CANCELADA: 'CANCELED',
  NAO_COMPARECEU: 'NO_SHOW',
};

// POST /api/telemedicine/sessions/[id]/status — transição da máquina de estados.
// Encerrar/cancelar exige 'attend'; demais transições exigem ao menos 'view'+sala.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await request.json());
    const target = body.status as TelemedicineStatus;
    const needsAttend = ['EM_ATENDIMENTO', 'PAUSADA', 'FINALIZADA'].includes(target);
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, needsAttend ? 'attend' : 'join_room');
    if (error) return error;

    if (session!.status === target) return NextResponse.json({ ok: true, status: target });
    if (!canTransition(session!.status, target)) {
      return NextResponse.json({ error: `Transição inválida: ${session!.status} → ${target}` }, { status: 409 });
    }

    const now = new Date();
    const stamps = timestampsFor(target, now);
    // Duração calculada no encerramento (do início efetivo ao fim).
    if (target === 'FINALIZADA' && session!.startedAt) {
      stamps.durationSeconds = Math.max(0, Math.round((now.getTime() - new Date(session!.startedAt).getTime()) / 1000));
    }
    if (target === 'CANCELADA' && body.reason) stamps.cancelReason = body.reason;

    const updated = await prisma.telemedicineSession.update({
      where: { id: session!.id },
      data: { status: target, ...stamps },
    });

    // Reflete na Agenda (status do Appointment) quando aplicável.
    const apptStatus = APPT_STATUS[target];
    if (apptStatus) {
      await prisma.appointment.update({
        where: { id: session!.appointmentId },
        data: {
          status: apptStatus,
          ...(target === 'FINALIZADA' ? { attendedAt: now } : {}),
          ...(target === 'CANCELADA' ? { canceledAt: now, cancellationReason: body.reason || null } : {}),
          ...(target === 'NAO_COMPARECEU' ? { noShowAt: now } : {}),
        },
      }).catch(() => {});
    }

    await teleEvent(session!.id, dbUser!.companyId, `STATUS_${target}`, {
      actorId: dbUser!.id, actorName: dbUser!.name, actorRole: dbUser!.role,
    });
    await writeAudit({
      dbUser: dbUser!, action: 'UPDATE_STATUS', entityType: 'TELECONSULTATION',
      entityId: session!.id, oldValues: { status: session!.status }, newValues: { status: target }, request,
    });

    // Follow-up automático em faltas (dispara o motor de automações da clínica).
    if (target === 'NAO_COMPARECEU' || target === 'FINALIZADA') {
      await runAutomations('APPOINTMENT_CREATED', {
        companyId: dbUser!.companyId, patientId: session!.patientId,
        summary: target === 'NAO_COMPARECEU' ? 'Paciente faltou à teleconsulta' : 'Teleconsulta finalizada',
      });
    }

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro na transição de status:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
