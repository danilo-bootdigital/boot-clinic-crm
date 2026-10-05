import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { contractByToken } from '@/lib/contracts/public';
import { maskPhone, OTP_MAX_SENDS } from '@/lib/contracts/signing';

export const dynamic = 'force-dynamic';

// GET /api/public/contracts/[token] — o contrato para o paciente ler e assinar.
// Sem login: quem tem o link é o destinatário da mensagem. Devolve só o que ele
// precisa ver (o próprio contrato), nada do resto do cadastro.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const c = await contractByToken(params.token);
    if (!c) return NextResponse.json({ error: 'Link inválido ou expirado. Peça um novo link à clínica.' }, { status: 404 });

    const [patient, company] = await Promise.all([
      prisma.patient.findUnique({ where: { id: c.patientId }, select: { name: true, phone: true, whatsapp: true } }),
      prisma.company.findUnique({ where: { id: c.companyId }, select: { name: true, logo: true } }),
    ]);

    // 1ª abertura vira evidência ("contrato aberto em").
    if (!c.viewedAt && c.status === 'SENT') {
      await prisma.patientContract.updateMany({ where: { id: c.id, viewedAt: null }, data: { viewedAt: new Date() } });
    }

    return NextResponse.json({
      title: c.title,
      content: c.content,
      status: c.status,
      signedAt: c.signedAt,
      patientFirstName: (patient?.name || '').split(' ')[0],
      clinicName: company?.name || 'Clínica',
      clinicLogo: company?.logo || null,
      phoneMasked: maskPhone(patient?.whatsapp || patient?.phone),
      codeSent: !!c.otpHash && !!c.otpExpiresAt && c.otpExpiresAt > new Date(),
      sendsLeft: Math.max(0, OTP_MAX_SENDS - c.otpSendCount),
    });
  } catch (err) {
    console.error('Erro ao abrir contrato público:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
