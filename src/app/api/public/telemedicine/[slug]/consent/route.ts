import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { teleEvent } from '@/lib/api/telemedicine';

// POST /api/public/telemedicine/[slug]/consent — paciente aceita o termo LGPD.
// Registra aceite + data/hora + IP + user-agent (rastreabilidade / compliance).
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const room = await prisma.telemedicineRoom.findUnique({ where: { publicSlug: params.slug } });
    if (!room) return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    const session = await prisma.telemedicineSession.findFirst({ where: { id: room.sessionId, deletedAt: null } });
    if (!session) return NextResponse.json({ error: 'Teleconsulta não encontrada' }, { status: 404 });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const ua = request.headers.get('user-agent') || undefined;
    const now = new Date();

    const consent = await prisma.telemedicineConsent.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' } });
    if (consent) {
      await prisma.telemedicineConsent.update({
        where: { id: consent.id }, data: { accepted: true, acceptedAt: now, ipAddress: ip, userAgent: ua },
      });
    } else {
      await prisma.telemedicineConsent.create({
        data: { companyId: session.companyId, sessionId: session.id, patientId: session.patientId, consentText: 'Aceite de teleatendimento', accepted: true, acceptedAt: now, ipAddress: ip, userAgent: ua },
      });
    }

    await teleEvent(session.id, session.companyId, 'CONSENT_ACCEPTED', { actorRole: 'PATIENT', actorName: 'Paciente', ipAddress: ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro ao registrar consentimento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
