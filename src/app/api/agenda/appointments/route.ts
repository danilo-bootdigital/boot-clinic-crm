import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { findAppointmentConflict } from '@/lib/api/appointments';
import { ownsPatient, ownsProfessional, ownsSpecialty } from '@/lib/api/ownership';
import { runAutomations } from '@/lib/automations/engine';
import { isModuleEnabled } from '@/lib/api/modules';
import { createSessionForAppointment, buildPatientLink, teleEvent } from '@/lib/api/telemedicine';
import { notifyTeleconsultation } from '@/lib/telemedicine/notify';

const CreateSchema = z.object({
  patientId: z.string().min(1, 'Paciente é obrigatório'),
  professionalId: z.string().min(1, 'Profissional é obrigatório'),
  specialtyId: z.string().min(1, 'Especialidade é obrigatória'),
  roomId: z.string().optional().or(z.literal('')),
  type: z.string().min(1, 'Tipo é obrigatório'),
  // Modalidade da consulta: presencial (default) ou teleconsulta.
  modality: z.enum(['PRESENCIAL', 'TELEMEDICINA']).optional(),
  startAt: z.string().min(1, 'Data/hora é obrigatória'),
  durationMinutes: z.coerce.number().min(5).max(480),
  source: z.string().optional(),
  notes: z.string().optional(),
});

// GET /api/agenda/appointments?date=YYYY-MM-DD&professionalId=
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'view');
    if (denied) return denied;

    const sp = request.nextUrl.searchParams;
    const where: any = { companyId: dbUser!.companyId, deletedAt: null };
    if (sp.get('professionalId')) where.professionalId = sp.get('professionalId');

    const dateStr = sp.get('date');
    if (dateStr) {
      const start = new Date(`${dateStr}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.startAt = { gte: start, lt: end };
    }

    const appts = await prisma.appointment.findMany({ where, orderBy: { startAt: 'asc' } });

    // Enriquecimento manual (sem relações Prisma).
    const patientIds = Array.from(new Set(appts.map((a) => a.patientId)));
    const profIds = Array.from(new Set(appts.map((a) => a.professionalId)));
    const specIds = Array.from(new Set(appts.map((a) => a.specialtyId)));
    const [patients, professionals, specialties] = await Promise.all([
      patientIds.length ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true, phone: true } }) : [],
      profIds.length ? prisma.professional.findMany({ where: { id: { in: profIds } }, select: { id: true, name: true } }) : [],
      specIds.length ? prisma.specialty.findMany({ where: { id: { in: specIds } }, select: { id: true, name: true } }) : [],
    ]);
    const pm = new Map(patients.map((p) => [p.id, p]));
    const prm = new Map(professionals.map((p) => [p.id, p]));
    const sm = new Map(specialties.map((s) => [s.id, s]));

    const enriched = appts.map((a) => ({
      ...a,
      patient: pm.get(a.patientId) ?? null,
      professional: prm.get(a.professionalId) ?? null,
      specialty: sm.get(a.specialtyId) ?? null,
    }));
    return NextResponse.json(enriched);
  } catch (err) {
    console.error('Erro ao listar agendamentos:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/agenda/appointments
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('agenda');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'agenda', 'edit');
    if (forbidden) return forbidden;

    const data = CreateSchema.parse(await request.json());

    // FKs precisam pertencer à empresa do usuário (multi-tenant).
    if (!(await ownsPatient(dbUser!.companyId, data.patientId)) ||
        !(await ownsProfessional(dbUser!.companyId, data.professionalId)) ||
        !(await ownsSpecialty(dbUser!.companyId, data.specialtyId))) {
      return NextResponse.json({ error: 'Paciente, profissional ou especialidade inválidos' }, { status: 400 });
    }

    const startAt = new Date(data.startAt);
    if (Number.isNaN(startAt.getTime())) return NextResponse.json({ error: 'Data/hora inválida' }, { status: 400 });
    const endAt = new Date(startAt.getTime() + data.durationMinutes * 60000);

    // Checagem de conflito: mesmo profissional, horário sobreposto, não cancelado.
    const conflict = await findAppointmentConflict({
      companyId: dbUser!.companyId,
      professionalId: data.professionalId,
      startAt,
      endAt,
    });
    if (conflict) return NextResponse.json({ error: 'Conflito de horário para este profissional' }, { status: 409 });

    const modality = data.modality || 'PRESENCIAL';
    const appt = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        professionalId: data.professionalId,
        specialtyId: data.specialtyId,
        type: data.type,
        status: 'PENDING',
        modality,
        startAt,
        endAt,
        durationMinutes: data.durationMinutes,
        source: data.source || 'AGENDA',
        notes: data.notes || null,
        createdById: dbUser!.id,
        companyId: dbUser!.companyId,
      },
    });
    await runAutomations('APPOINTMENT_CREATED', { companyId: dbUser!.companyId, patientId: appt.patientId, summary: 'Nova consulta agendada' });

    // Teleconsulta: nasce da Agenda. Gera sala + link + token automaticamente e
    // dispara o envio do link por WhatsApp (best-effort). Só se o módulo estiver
    // habilitado para a clínica (nível SaaS + ativação).
    let teleSession: { id: string; room?: { publicSlug: string; roomUrl: string } | null } | null = null;
    if (modality === 'TELEMEDICINA' && (await isModuleEnabled({ id: dbUser!.companyId, plan: dbUser!.company?.plan }, 'telemedicina'))) {
      try {
        const [patient, professional] = await Promise.all([
          prisma.patient.findUnique({ where: { id: appt.patientId }, select: { name: true, phone: true, whatsapp: true } }),
          prisma.professional.findUnique({ where: { id: appt.professionalId }, select: { name: true } }),
        ]);
        const session = await createSessionForAppointment(
          { id: appt.id, patientId: appt.patientId, professionalId: appt.professionalId, companyId: appt.companyId, startAt },
          dbUser!.id,
          patient?.name || 'Paciente',
          professional?.name || 'Profissional',
        );
        teleSession = session as any;
        const phone = patient?.whatsapp || patient?.phone;
        if (session.room && phone) {
          const link = buildPatientLink(session.room.publicSlug);
          await notifyTeleconsultation('CREATED', {
            companyId: appt.companyId, patientId: appt.patientId, sessionId: session.id,
            phone, patientName: patient?.name || 'Paciente', link, startAt,
          });
          await teleEvent(session.id, appt.companyId, 'LINK_SENT', { actorId: dbUser!.id, metadata: { channel: 'whatsapp' } });
        }
      } catch (e) {
        console.error('Falha ao criar sessão de telemedicina:', e);
      }
    }

    return NextResponse.json({ ...appt, teleconsultationId: teleSession?.id ?? null }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar agendamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
