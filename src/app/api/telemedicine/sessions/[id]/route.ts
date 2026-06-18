import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, buildPatientLink } from '@/lib/api/telemedicine';
import { clinicalAreaLevel } from '@/lib/api/clinical-access';

// GET /api/telemedicine/sessions/[id]
// Detalhe da teleconsulta + CONTEXTO COMPLETO do paciente em um só payload, para
// o médico atender sem trocar de tela. As seções clínicas sensíveis (anamnese,
// prontuário, imagens) só vêm se o usuário tem acesso à área (LGPD).
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'view');
    if (error) return error;

    const companyId = dbUser!.companyId;
    const patientId = session!.patientId;

    const canAnamnese = clinicalAreaLevel(dbUser!, 'anamnese') !== 'none';
    const canProntuario = clinicalAreaLevel(dbUser!, 'prontuario') !== 'none';
    const canImagens = clinicalAreaLevel(dbUser!, 'imagens') !== 'none';
    const canContratos = clinicalAreaLevel(dbUser!, 'contratos') !== 'none';
    const canOrcamentos = clinicalAreaLevel(dbUser!, 'orcamentos') !== 'none';

    const [
      room, participants, consents, attachments, chat, events,
      patient, tags, timeline, professional, appointment,
      anamneses, records, contracts, quotes, images, documents, pastAppointments,
    ] = await Promise.all([
      prisma.telemedicineRoom.findUnique({ where: { sessionId: session!.id } }),
      prisma.telemedicineParticipant.findMany({ where: { sessionId: session!.id }, select: { id: true, role: true, displayName: true, joinedAt: true, leftAt: true, lastSeenAt: true } }),
      prisma.telemedicineConsent.findMany({ where: { sessionId: session!.id }, orderBy: { createdAt: 'desc' } }),
      prisma.telemedicineAttachment.findMany({ where: { sessionId: session!.id, deletedAt: null }, orderBy: { createdAt: 'desc' } }),
      prisma.telemedicineChat.findMany({ where: { sessionId: session!.id }, orderBy: { createdAt: 'asc' }, take: 500 }),
      prisma.telemedicineAuditLog.findMany({ where: { sessionId: session!.id }, orderBy: { createdAt: 'asc' } }),
      prisma.patient.findFirst({ where: { id: patientId, companyId } }),
      prisma.patientTag.findMany({ where: { patientId }, select: { tag: { select: { id: true, name: true, color: true } } } }),
      prisma.timelineEvent.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.professional.findUnique({ where: { id: session!.professionalId }, select: { id: true, name: true, crm: true } }),
      prisma.appointment.findUnique({ where: { id: session!.appointmentId } }),
      canAnamnese ? prisma.patientAnamnesis.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }) : Promise.resolve([]),
      canProntuario ? prisma.medicalRecord.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }) : Promise.resolve([]),
      canContratos ? prisma.patientContract.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }) : Promise.resolve([]),
      canOrcamentos ? prisma.clinicalQuote.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20 }) : Promise.resolve([]),
      canImagens ? prisma.patientImage.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 }) : Promise.resolve([]),
      prisma.patientDocument.findMany({ where: { patientId, companyId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.appointment.findMany({ where: { patientId, companyId, deletedAt: null, id: { not: session!.appointmentId } }, orderBy: { startAt: 'desc' }, take: 20 }),
    ]);

    return NextResponse.json({
      session: { ...session, patientLink: room ? buildPatientLink(room.publicSlug) : null },
      room,
      participants,
      consents,
      attachments,
      chat,
      events,
      professional,
      appointment,
      patient: {
        ...patient,
        tags: tags.map((t) => t.tag),
      },
      access: { canAnamnese, canProntuario, canImagens, canContratos, canOrcamentos },
      context: {
        timeline,
        anamneses,
        records,
        contracts,
        quotes,
        images,
        documents,
        pastAppointments,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar teleconsulta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
