import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildPatientLink, teleEvent } from '@/lib/api/telemedicine';
import { notifyTeleconsultation, type TeleNotifyEvent } from '@/lib/telemedicine/notify';

// Lembretes automáticos de teleconsulta (24h / 1h / 15min) + detecção de atraso.
// Idempotente: cada envio grava um evento NOTIFY_* no TelemedicineAuditLog e só
// dispara se ainda não houver esse evento para a sessão (compartilha a trava com
// o reenvio manual de /sessions/[id]/notify). Roda via Vercel Cron.
//
// Segurança: exige `Authorization: Bearer <CRON_SECRET>` (a Vercel injeta esse
// header automaticamente nas invocações de cron quando CRON_SECRET está definido).

export const dynamic = 'force-dynamic';

const MIN = 60 * 1000;
const TERMINAL = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'];

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado → não roda (fail-safe)
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * MIN);

  // Candidatas: agendadas para as próximas 24h (lembretes) ou recém-atrasadas (atraso).
  const sessions = await prisma.telemedicineSession.findMany({
    where: {
      deletedAt: null,
      status: { notIn: TERMINAL as any },
      scheduledAt: { gte: new Date(now.getTime() - 60 * MIN), lte: in24h },
    },
    select: { id: true, companyId: true, patientId: true, scheduledAt: true, status: true, patientJoinedAt: true },
    take: 1000,
  });
  if (sessions.length === 0) return NextResponse.json({ ok: true, processed: 0, sent: 0 });

  const ids = sessions.map((s) => s.id);
  const [rooms, patients, sentEvents] = await Promise.all([
    prisma.telemedicineRoom.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true, publicSlug: true } }),
    prisma.patient.findMany({ where: { id: { in: Array.from(new Set(sessions.map((s) => s.patientId))) } }, select: { id: true, name: true, phone: true, whatsapp: true } }),
    prisma.telemedicineAuditLog.findMany({
      where: { sessionId: { in: ids }, event: { in: ['NOTIFY_REMINDER_24H', 'NOTIFY_REMINDER_1H', 'NOTIFY_REMINDER_15M', 'NOTIFY_LATE'] } },
      select: { sessionId: true, event: true },
    }),
  ]);
  const roomMap = new Map(rooms.map((r) => [r.sessionId, r]));
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const alreadySent = new Set(sentEvents.map((e) => `${e.sessionId}:${e.event}`));

  // Decide qual lembrete (no máximo um) cabe a cada sessão neste tick.
  function dueEvent(scheduledAt: Date, status: string, patientJoinedAt: Date | null): TeleNotifyEvent | null {
    const diff = scheduledAt.getTime() - now.getTime(); // ms até a consulta (negativo = passou)
    if (diff > 60 * MIN && diff <= 24 * 60 * MIN) return 'REMINDER_24H';
    if (diff > 15 * MIN && diff <= 60 * MIN) return 'REMINDER_1H';
    if (diff > 0 && diff <= 15 * MIN) return 'REMINDER_15M';
    // Atraso: passou >10min do horário e o paciente ainda não entrou.
    if (diff < -10 * MIN && !patientJoinedAt && !TERMINAL.includes(status)) return 'LATE';
    return null;
  }

  let sent = 0;
  for (const s of sessions) {
    const event = dueEvent(s.scheduledAt, s.status, s.patientJoinedAt);
    if (!event) continue;
    const key = `${s.id}:NOTIFY_${event}`;
    if (alreadySent.has(key)) continue;

    const room = roomMap.get(s.id);
    const patient = patMap.get(s.patientId);
    if (!room) continue;

    await notifyTeleconsultation(event, {
      companyId: s.companyId, patientId: s.patientId, sessionId: s.id,
      phone: patient?.whatsapp || patient?.phone, patientName: patient?.name || 'Paciente',
      link: buildPatientLink(room.publicSlug), startAt: s.scheduledAt,
    });
    await teleEvent(s.id, s.companyId, `NOTIFY_${event}`, { actorName: 'Sistema (cron)' });
    sent++;
  }

  return NextResponse.json({ ok: true, processed: sessions.length, sent });
}
