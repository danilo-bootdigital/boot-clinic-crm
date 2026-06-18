import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET /api/public/telemedicine/[slug] — info MÍNIMA para a sala pública do paciente.
// Sem login: o slug é opaco e imprevisível. Nunca expõe dado clínico sensível —
// apenas o necessário para o paciente reconhecer e entrar na sua consulta.
export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const room = await prisma.telemedicineRoom.findUnique({ where: { publicSlug: params.slug } });
    if (!room) return NextResponse.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    const session = await prisma.telemedicineSession.findFirst({
      where: { id: room.sessionId, deletedAt: null },
    });
    if (!session) return NextResponse.json({ error: 'Teleconsulta não encontrada' }, { status: 404 });

    const [patient, professional, company, consent] = await Promise.all([
      prisma.patient.findUnique({ where: { id: session.patientId }, select: { name: true } }),
      prisma.professional.findUnique({ where: { id: session.professionalId }, select: { name: true } }),
      prisma.company.findUnique({ where: { id: session.companyId }, select: { name: true, logo: true } }),
      prisma.telemedicineConsent.findFirst({ where: { sessionId: session.id }, orderBy: { createdAt: 'desc' } }),
    ]);

    const terminal = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'].includes(session.status);
    const firstName = (patient?.name || 'Paciente').split(' ')[0];

    return NextResponse.json({
      patientFirstName: firstName,
      professionalName: professional?.name || 'Profissional',
      clinicName: company?.name || 'Clínica',
      clinicLogo: company?.logo || null,
      scheduledAt: session.scheduledAt,
      status: session.status,
      ended: terminal,
      consentRequired: !consent?.accepted,
      consentText: consent?.consentText || null,
    });
  } catch (err) {
    console.error('Erro na sala pública:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
