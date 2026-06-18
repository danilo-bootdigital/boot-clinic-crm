import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { requireTelemedicine, type TelemedicineAction } from '@/lib/api/telemedicine-access';
import {
  buildRoomUrl,
  buildPatientLink,
  generateRoomKey,
  generatePublicSlug,
  generateAccessToken,
  defaultTokenExpiry,
  videoProvider,
} from '@/lib/telemedicine/video';
import { TelemedicineStatus } from '@prisma/client';

const MODULE_KEY = 'telemedicina';

// ---------------------------------------------------------------------------
// Resolução de usuário + escopo (espelha resolveClinicalUser).
//   getCurrentUser → subscriptionBlock → requireModuleEnabled → requireTelemedicine
// ---------------------------------------------------------------------------
export async function resolveTelemedicineUser(action: TelemedicineAction) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: { select: { status: true, plan: true } } },
  });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  const moduleOff = await requireModuleEnabled(dbUser, MODULE_KEY);
  if (moduleOff) return { error: moduleOff };

  const denied = requireTelemedicine(dbUser, action);
  if (denied) return { error: denied };

  return { dbUser };
}

// Resolve usuário + sessão (mesma empresa, não deletada). Para rotas /[id].
export async function resolveTelemedicineSession(sessionId: string, action: TelemedicineAction) {
  const { dbUser, error } = await resolveTelemedicineUser(action);
  if (error) return { error };

  const session = await prisma.telemedicineSession.findFirst({
    where: { id: sessionId, companyId: dbUser!.companyId, deletedAt: null },
  });
  if (!session) return { error: NextResponse.json({ error: 'Teleconsulta não encontrada' }, { status: 404 }) };

  return { dbUser, session };
}

// ---------------------------------------------------------------------------
// Criação da sessão a partir de um Appointment (modality = TELEMEDICINA).
// Idempotente: se já houver sessão p/ o appointment, devolve a existente.
// Gera sala + link público + token do paciente + termo de consentimento.
// ---------------------------------------------------------------------------
export interface AppointmentLike {
  id: string;
  patientId: string;
  professionalId: string;
  companyId: string;
  startAt: Date;
}

export async function createSessionForAppointment(
  appt: AppointmentLike,
  createdById: string,
  patientName: string,
  professionalName: string,
) {
  const existing = await prisma.telemedicineSession.findUnique({
    where: { appointmentId: appt.id },
    include: { room: true },
  });
  if (existing) return existing;

  const roomKey = generateRoomKey();
  const publicSlug = generatePublicSlug();
  const roomUrl = buildRoomUrl(roomKey);
  const patientToken = generateAccessToken();
  const tokenExpiresAt = defaultTokenExpiry(appt.startAt);

  const session = await prisma.telemedicineSession.create({
    data: {
      companyId: appt.companyId,
      appointmentId: appt.id,
      patientId: appt.patientId,
      professionalId: appt.professionalId,
      createdById,
      status: TelemedicineStatus.AGENDADA,
      scheduledAt: appt.startAt,
      room: {
        create: {
          companyId: appt.companyId,
          provider: videoProvider(),
          roomKey,
          roomUrl,
          publicSlug,
        },
      },
      participants: {
        create: [
          {
            companyId: appt.companyId,
            role: 'PATIENT',
            displayName: patientName,
            token: patientToken,
            tokenExpiresAt,
          },
          {
            companyId: appt.companyId,
            role: 'DOCTOR',
            userId: createdById,
            displayName: professionalName,
            token: generateAccessToken(),
            tokenExpiresAt,
          },
        ],
      },
      consents: {
        create: {
          companyId: appt.companyId,
          patientId: appt.patientId,
          consentText: DEFAULT_CONSENT_TEXT,
        },
      },
    },
    include: { room: true },
  });

  // Espelha a URL no Appointment (atalho para a Agenda).
  await prisma.appointment.update({ where: { id: appt.id }, data: { roomUrl } }).catch(() => {});

  await teleEvent(session.id, appt.companyId, 'SESSION_CREATED', { actorId: createdById });

  return session;
}

export const DEFAULT_CONSENT_TEXT =
  'Autorizo a realização de atendimento por telemedicina (teleconsulta), ' +
  'ciente de que os dados serão tratados de forma confidencial conforme a LGPD ' +
  '(Lei 13.709/2018). Estou em ambiente reservado e concordo com o registro do ' +
  'atendimento em prontuário eletrônico.';

// ---------------------------------------------------------------------------
// Transições de status. Centraliza a máquina de estados + carimba os marcos
// temporais que alimentam o dashboard (duração/comparecimento).
// ---------------------------------------------------------------------------
export const TELE_TRANSITIONS: Record<TelemedicineStatus, TelemedicineStatus[]> = {
  AGENDADA: ['AGUARDANDO_PACIENTE', 'PACIENTE_ENTROU', 'MEDICO_ENTROU', 'CANCELADA', 'NAO_COMPARECEU'],
  AGUARDANDO_PACIENTE: ['PACIENTE_ENTROU', 'MEDICO_ENTROU', 'EM_ATENDIMENTO', 'CANCELADA', 'NAO_COMPARECEU'],
  PACIENTE_ENTROU: ['MEDICO_ENTROU', 'EM_ATENDIMENTO', 'CANCELADA', 'NAO_COMPARECEU'],
  MEDICO_ENTROU: ['EM_ATENDIMENTO', 'PACIENTE_ENTROU', 'CANCELADA', 'NAO_COMPARECEU'],
  EM_ATENDIMENTO: ['PAUSADA', 'FINALIZADA'],
  PAUSADA: ['EM_ATENDIMENTO', 'FINALIZADA'],
  FINALIZADA: [],
  CANCELADA: [],
  NAO_COMPARECEU: [],
};

export function canTransition(from: TelemedicineStatus, to: TelemedicineStatus): boolean {
  return TELE_TRANSITIONS[from]?.includes(to) ?? false;
}

// Campos temporais carimbados por status (best-effort, idempotente).
export function timestampsFor(to: TelemedicineStatus, now: Date): Record<string, any> {
  switch (to) {
    case 'PACIENTE_ENTROU':
      return { patientJoinedAt: now };
    case 'MEDICO_ENTROU':
      return { doctorJoinedAt: now };
    case 'EM_ATENDIMENTO':
      return { startedAt: now };
    case 'PAUSADA':
      return { pausedAt: now };
    case 'FINALIZADA':
      return { endedAt: now };
    case 'NAO_COMPARECEU':
      return { noShowAt: now };
    case 'CANCELADA':
      return { canceledAt: now };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Trilha de eventos da sala (TelemedicineAuditLog). Best-effort — nunca lança.
// ---------------------------------------------------------------------------
export async function teleEvent(
  sessionId: string,
  companyId: string,
  event: string,
  opts: { actorRole?: string; actorId?: string; actorName?: string; metadata?: any; ipAddress?: string } = {},
) {
  try {
    await prisma.telemedicineAuditLog.create({
      data: {
        sessionId,
        companyId,
        event,
        actorRole: opts.actorRole,
        actorId: opts.actorId,
        actorName: opts.actorName,
        metadata: opts.metadata ?? undefined,
        ipAddress: opts.ipAddress,
      },
    });
  } catch (e) {
    console.error('[telemedicine] falha ao gravar evento:', e);
  }
}

// Link público do paciente a partir do slug da sala.
export { buildPatientLink };
