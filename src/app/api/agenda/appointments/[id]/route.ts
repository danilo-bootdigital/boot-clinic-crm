import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { findAppointmentConflict } from '@/lib/api/appointments';
import { ownsPatient, ownsProfessional, ownsSpecialty } from '@/lib/api/ownership';

const UpdateSchema = z.object({
  patientId: z.string().optional(),
  professionalId: z.string().optional(),
  specialtyId: z.string().optional(),
  type: z.string().optional(),
  startAt: z.string().optional(),
  durationMinutes: z.coerce.number().min(5).max(480).optional(),
  notes: z.string().optional().nullable(),
});

// GET /api/agenda/appointments/[id]
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'view');
    if (denied) return denied;

    const a = await prisma.appointment.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!a) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    const [patient, professional, specialty] = await Promise.all([
      prisma.patient.findUnique({ where: { id: a.patientId }, select: { id: true, name: true, phone: true } }),
      prisma.professional.findUnique({ where: { id: a.professionalId }, select: { id: true, name: true } }),
      prisma.specialty.findUnique({ where: { id: a.specialtyId }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ ...a, patient, professional, specialty });
  } catch (err) {
    console.error('Erro ao buscar agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT/PATCH /api/agenda/appointments/[id]
async function update(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;

    const forbidden = requirePermission(dbUser!, 'agenda', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.appointment.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());

    // FKs alterados precisam pertencer à empresa.
    if (!(await ownsPatient(dbUser!.companyId, d.patientId)) ||
        !(await ownsProfessional(dbUser!.companyId, d.professionalId)) ||
        !(await ownsSpecialty(dbUser!.companyId, d.specialtyId))) {
      return NextResponse.json({ error: 'Paciente, profissional ou especialidade inválidos' }, { status: 400 });
    }

    let startAt = existing.startAt;
    let endAt = existing.endAt;
    if (d.startAt) startAt = new Date(d.startAt);
    const duration = d.durationMinutes ?? existing.durationMinutes;
    if (d.startAt || d.durationMinutes) endAt = new Date(startAt.getTime() + duration * 60000);

    // Re-checa conflito quando muda horário/duração/profissional (ignora o próprio).
    if (d.startAt || d.durationMinutes || d.professionalId) {
      const conflict = await findAppointmentConflict({
        companyId: dbUser!.companyId,
        professionalId: d.professionalId ?? existing.professionalId,
        startAt,
        endAt,
        excludeId: params.id,
      });
      if (conflict) return NextResponse.json({ error: 'Conflito de horário para este profissional' }, { status: 409 });
    }

    const appt = await prisma.appointment.update({
      where: { id: params.id },
      data: {
        ...(d.patientId !== undefined && { patientId: d.patientId }),
        ...(d.professionalId !== undefined && { professionalId: d.professionalId }),
        ...(d.specialtyId !== undefined && { specialtyId: d.specialtyId }),
        ...(d.type !== undefined && { type: d.type }),
        ...(d.notes !== undefined && { notes: d.notes || null }),
        ...((d.startAt || d.durationMinutes) && { startAt, endAt, durationMinutes: duration }),
      },
    });
    return NextResponse.json(appt);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export const PUT = update;
export const PATCH = update;

// DELETE /api/agenda/appointments/[id] - soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'agenda', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.appointment.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 });

    await prisma.appointment.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
