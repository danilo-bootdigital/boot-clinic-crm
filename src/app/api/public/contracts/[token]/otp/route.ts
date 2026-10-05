import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { contractByToken } from '@/lib/contracts/public';
import { sendWhatsappForCompany } from '@/lib/messaging/adapters/whatsapp/evolution';
import {
  maskPhone, newOtp, OTP_MAX_SENDS, OTP_RESEND_SECONDS, OTP_TTL_MINUTES,
} from '@/lib/contracts/signing';

// POST /api/public/contracts/[token]/otp — envia o código de 6 dígitos para o
// WhatsApp do CADASTRO do paciente (nunca para um número informado na tela:
// o código prova que quem assina tem o celular da pessoa).
export async function POST(_request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const c = await contractByToken(params.token);
    if (!c) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
    if (c.status === 'SIGNED') return NextResponse.json({ error: 'Este contrato já foi assinado.' }, { status: 409 });

    if (c.otpSendCount >= OTP_MAX_SENDS) {
      return NextResponse.json({ error: 'Limite de códigos atingido. Peça um novo link à clínica.' }, { status: 429 });
    }
    if (c.otpLastSentAt && Date.now() - c.otpLastSentAt.getTime() < OTP_RESEND_SECONDS * 1000) {
      const wait = Math.ceil((OTP_RESEND_SECONDS * 1000 - (Date.now() - c.otpLastSentAt.getTime())) / 1000);
      return NextResponse.json({ error: `Aguarde ${wait}s para pedir outro código.`, retryIn: wait }, { status: 429 });
    }

    const patient = await prisma.patient.findUnique({ where: { id: c.patientId }, select: { name: true, phone: true, whatsapp: true } });
    const phone = patient?.whatsapp || patient?.phone;
    if (!phone) return NextResponse.json({ error: 'Cadastro sem WhatsApp. Fale com a clínica.' }, { status: 400 });

    const { code, hash } = newOtp(c.id);
    const now = new Date();
    // Contagem e cooldown gravados ANTES do envio: duas abas pedindo ao mesmo
    // tempo não furam o limite.
    const { count } = await prisma.patientContract.updateMany({
      where: { id: c.id, otpSendCount: c.otpSendCount },
      data: {
        otpHash: hash,
        otpExpiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
        otpAttempts: 0,
        otpSendCount: { increment: 1 },
        otpLastSentAt: now,
        otpSentTo: maskPhone(phone),
      },
    });
    if (count === 0) return NextResponse.json({ error: 'Tente novamente em instantes.' }, { status: 429 });

    const sent = await sendWhatsappForCompany(
      c.companyId,
      phone,
      `Seu código para assinar o contrato "${c.title}" é *${code}*.\nVale por ${OTP_TTL_MINUTES} minutos. Não compartilhe este código.`,
    );
    if (!sent.ok) {
      return NextResponse.json({ error: 'Não conseguimos enviar o código agora. Tente de novo em instantes ou fale com a clínica.' }, { status: 502 });
    }
    return NextResponse.json({ sentTo: maskPhone(phone), expiresInMinutes: OTP_TTL_MINUTES, retryIn: OTP_RESEND_SECONDS });
  } catch (err) {
    console.error('Erro ao enviar código de assinatura:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
