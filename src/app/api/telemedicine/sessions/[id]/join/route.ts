import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineSession, teleEvent } from '@/lib/api/telemedicine';
import { TelemedicineStatus } from '@prisma/client';

// POST /api/telemedicine/sessions/[id]/join — médico/staff entra na sala pelo CRM.
// Marca doctorJoinedAt, avança o status e devolve a URL da sala de vídeo.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, session, error } = await resolveTelemedicineSession(params.id, 'join_room');
    if (error) return error;

    const room = await prisma.telemedicineRoom.findUnique({ where: { sessionId: session!.id } });
    if (!room) return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });

    const now = new Date();
    // Avança o status: se paciente já entrou → MEDICO_ENTROU; senão AGUARDANDO_PACIENTE.
    let nextStatus: TelemedicineStatus = session!.status;
    const terminal: TelemedicineStatus[] = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'];
    if (!terminal.includes(session!.status)) {
      nextStatus = session!.patientJoinedAt ? 'MEDICO_ENTROU' : 'AGUARDANDO_PACIENTE';
    }

    await prisma.telemedicineSession.update({
      where: { id: session!.id },
      data: { doctorJoinedAt: session!.doctorJoinedAt ?? now, status: nextStatus },
    });
    await prisma.telemedicineParticipant.updateMany({
      where: { sessionId: session!.id, role: 'DOCTOR' },
      data: { joinedAt: now, lastSeenAt: now, userId: dbUser!.id },
    });
    await teleEvent(session!.id, dbUser!.companyId, 'DOCTOR_JOINED', {
      actorId: dbUser!.id, actorName: dbUser!.name, actorRole: dbUser!.role,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    });

    return NextResponse.json({ roomUrl: room.roomUrl, provider: room.provider, status: nextStatus });
  } catch (err) {
    console.error('Erro ao entrar na sala (médico):', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
