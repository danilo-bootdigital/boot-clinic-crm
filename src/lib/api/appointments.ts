import { prisma } from '@/lib/db/prisma';
import { isModuleEnabled } from '@/lib/api/modules';
import { createSessionForAppointment, buildPatientLink, teleEvent } from '@/lib/api/telemedicine';
import { notifyTeleconsultation } from '@/lib/telemedicine/notify';

// Retorna um agendamento que conflita (mesmo profissional, janela sobreposta,
// não cancelado/faltou), ou null. `excludeId` ignora o próprio agendamento ao editar.
export async function findAppointmentConflict(args: {
  companyId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  excludeId?: string;
}) {
  const { companyId, professionalId, startAt, endAt, excludeId } = args;
  return prisma.appointment.findFirst({
    where: {
      companyId,
      professionalId,
      deletedAt: null,
      status: { notIn: ['CANCELED', 'NO_SHOW'] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
}

/**
 * Provisiona a teleconsulta de um agendamento recém-criado: sala + link público
 * + token do paciente, e dispara o envio do link por WhatsApp (best-effort).
 *
 * Extraído da rota da Agenda para que o agendamento criado a partir de uma
 * conversa da mensageria tenha EXATAMENTE o mesmo comportamento — a teleconsulta
 * continua nascendo de um agendamento, seja ele criado na Agenda ou no chat.
 *
 * Nunca lança: falha aqui não desfaz o agendamento, que já está gravado.
 */
export async function provisionTeleconsultation(
  appt: { id: string; patientId: string; professionalId: string; companyId: string; startAt: Date },
  actor: { id: string; companyId: string; company?: { plan?: string | null } | null },
): Promise<{ id: string } | null> {
  // Só se o módulo estiver habilitado para a clínica (nível SaaS + ativação).
  if (!(await isModuleEnabled({ id: actor.companyId, plan: actor.company?.plan }, 'telemedicina'))) {
    return null;
  }
  try {
    const [patient, professional] = await Promise.all([
      prisma.patient.findUnique({ where: { id: appt.patientId }, select: { name: true, phone: true, whatsapp: true } }),
      prisma.professional.findUnique({ where: { id: appt.professionalId }, select: { name: true } }),
    ]);
    const session = await createSessionForAppointment(
      appt,
      actor.id,
      patient?.name || 'Paciente',
      professional?.name || 'Profissional',
    );
    const phone = patient?.whatsapp || patient?.phone;
    if (session.room && phone) {
      const link = buildPatientLink(session.room.publicSlug);
      await notifyTeleconsultation('CREATED', {
        companyId: appt.companyId,
        patientId: appt.patientId,
        sessionId: session.id,
        phone,
        patientName: patient?.name || 'Paciente',
        link,
        startAt: appt.startAt,
      });
      await teleEvent(session.id, appt.companyId, 'LINK_SENT', { actorId: actor.id, metadata: { channel: 'whatsapp' } });
    }
    return { id: session.id };
  } catch (e) {
    console.error('Falha ao criar sessão de telemedicina:', e);
    return null;
  }
}
