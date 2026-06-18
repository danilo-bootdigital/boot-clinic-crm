import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineUser, createSessionForAppointment, buildPatientLink, teleEvent } from '@/lib/api/telemedicine';
import { notifyTeleconsultation } from '@/lib/telemedicine/notify';
import { ownsPatient } from '@/lib/api/ownership';

const CreateSchema = z.object({
  appointmentId: z.string().min(1, 'Consulta de origem é obrigatória'),
});

// GET /api/telemedicine/sessions?status=&date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveTelemedicineUser('view');
    if (error) return error;

    const sp = request.nextUrl.searchParams;
    const where: any = { companyId: dbUser!.companyId, deletedAt: null };
    const status = sp.get('status');
    if (status) where.status = status;
    const dateStr = sp.get('date');
    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.scheduledAt = { gte: start, lt: end };
    }

    const sessions = await prisma.telemedicineSession.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: { room: { select: { roomUrl: true, publicSlug: true, provider: true } } },
    });

    // Enriquecimento manual (padrão da base — sem relações cruzando módulos).
    const patientIds = Array.from(new Set(sessions.map((s) => s.patientId)));
    const profIds = Array.from(new Set(sessions.map((s) => s.professionalId)));
    const [patients, professionals] = await Promise.all([
      patientIds.length ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true, phone: true, whatsapp: true } }) : [],
      profIds.length ? prisma.professional.findMany({ where: { id: { in: profIds } }, select: { id: true, name: true } }) : [],
    ]);
    const pm = new Map(patients.map((p) => [p.id, p]));
    const prm = new Map(professionals.map((p) => [p.id, p]));

    const enriched = sessions.map((s) => ({
      ...s,
      patientLink: s.room ? buildPatientLink(s.room.publicSlug) : null,
      patient: pm.get(s.patientId) ?? null,
      professional: prm.get(s.professionalId) ?? null,
    }));
    return NextResponse.json(enriched);
  } catch (err) {
    console.error('Erro ao listar teleconsultas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/telemedicine/sessions — cria a sessão a partir de um Appointment já
// existente (ex.: consulta presencial convertida em teleconsulta). Idempotente.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveTelemedicineUser('schedule');
    if (error) return error;

    const data = CreateSchema.parse(await request.json());
    const appt = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!appt) return NextResponse.json({ error: 'Consulta não encontrada' }, { status: 404 });
    if (!(await ownsPatient(dbUser!.companyId, appt.patientId))) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }

    const [patient, professional] = await Promise.all([
      prisma.patient.findUnique({ where: { id: appt.patientId }, select: { name: true, phone: true, whatsapp: true } }),
      prisma.professional.findUnique({ where: { id: appt.professionalId }, select: { name: true } }),
    ]);

    // Garante modalidade TELEMEDICINA na consulta de origem.
    if (appt.modality !== 'TELEMEDICINA') {
      await prisma.appointment.update({ where: { id: appt.id }, data: { modality: 'TELEMEDICINA' } }).catch(() => {});
    }

    const session = await createSessionForAppointment(
      { id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId, companyId: appt.companyId, startAt: appt.startAt },
      dbUser!.id,
      patient?.name || 'Paciente',
      professional?.name || 'Profissional',
    );

    const phone = patient?.whatsapp || patient?.phone;
    if (session.room && phone) {
      const link = buildPatientLink(session.room.publicSlug);
      await notifyTeleconsultation('CREATED', {
        companyId: appt.companyId, patientId: appt.patientId, sessionId: session.id,
        phone, patientName: patient?.name || 'Paciente', link, startAt: appt.startAt, userId: dbUser!.id,
      });
      await teleEvent(session.id, appt.companyId, 'LINK_SENT', { actorId: dbUser!.id });
    }

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar teleconsulta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
