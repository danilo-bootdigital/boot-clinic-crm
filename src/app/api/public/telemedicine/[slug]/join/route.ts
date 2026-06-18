import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { teleEvent } from '@/lib/api/telemedicine';
import { TelemedicineStatus } from '@prisma/client';

// POST /api/public/telemedicine/[slug]/join — paciente entra na sala.
// Exige consentimento aceito. Marca patientJoinedAt, avança o status e devolve a
// URL da sala de vídeo. Registra IP/UA do participante (compliance).
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const room = await prisma.telemedicineRoom.findUnique({ where: { publicSlug: params.slug } });
    if (!room || !room.isActive) return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });
    const session = await prisma.telemedicineSession.findFirst({ where: { id: room.sessionId, deletedAt: null } });
    if (!session) return NextResponse.json({ error: 'Teleconsulta não encontrada' }, { status: 404 });

    if (['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'].includes(session.status)) {
      return NextResponse.json({ error: 'Esta teleconsulta já foi encerrada.' }, { status: 409 });
    }

    const consent = await prisma.telemedicineConsent.findFirst({ where: { sessionId: session.id, accepted: true } });
    if (!consent) return NextResponse.json({ error: 'É necessário aceitar o termo de teleatendimento.', code: 'CONSENT_REQUIRED' }, { status: 403 });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const ua = request.headers.get('user-agent') || undefined;
    const now = new Date();

    const terminal: TelemedicineStatus[] = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'];
    let nextStatus: TelemedicineStatus = session.status;
    if (!terminal.includes(session.status)) {
      nextStatus = session.doctorJoinedAt ? 'MEDICO_ENTROU' : 'PACIENTE_ENTROU';
    }

    await prisma.telemedicineSession.update({
      where: { id: session.id },
      data: { patientJoinedAt: session.patientJoinedAt ?? now, status: nextStatus },
    });
    await prisma.telemedicineParticipant.updateMany({
      where: { sessionId: session.id, role: 'PATIENT' },
      data: { joinedAt: now, lastSeenAt: now, ipAddress: ip, userAgent: ua },
    });
    await teleEvent(session.id, session.companyId, 'PATIENT_JOINED', { actorRole: 'PATIENT', actorName: 'Paciente', ipAddress: ip });

    return NextResponse.json({ roomUrl: room.roomUrl, provider: room.provider, status: nextStatus });
  } catch (err) {
    console.error('Erro ao entrar na sala (paciente):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
