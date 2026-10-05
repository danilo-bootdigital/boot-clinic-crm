import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { contractByToken } from '@/lib/contracts/public';
import { clientIp, decodeSignaturePng, OTP_MAX_ATTEMPTS, otpMatches } from '@/lib/contracts/signing';
import { finalizeContractSignature, SignError } from '@/lib/contracts/finalize';

// POST /api/public/contracts/[token]/sign — assinatura REMOTA pelo paciente.
// Exige: código do WhatsApp válido + CPF do cadastro + traço + aceite.
const Schema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Digite o código de 6 dígitos'),
  cpf: z.string().min(11, 'Digite seu CPF'),
  signature: z.string().min(1, 'Assine no quadro'),
  accepted: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos' }) }),
});

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const c = await contractByToken(params.token);
    if (!c) return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
    if (c.status === 'SIGNED') return NextResponse.json({ error: 'Este contrato já foi assinado.' }, { status: 409 });

    const d = Schema.parse(await request.json());

    if (!c.otpHash || !c.otpExpiresAt || c.otpExpiresAt < new Date()) {
      return NextResponse.json({ error: 'Código expirado. Peça um novo código.' }, { status: 400 });
    }
    if (c.otpAttempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Muitas tentativas. Peça um novo código.' }, { status: 429 });
    }
    if (!otpMatches(c.id, d.code, c.otpHash)) {
      await prisma.patientContract.update({ where: { id: c.id }, data: { otpAttempts: { increment: 1 } } });
      const left = OTP_MAX_ATTEMPTS - c.otpAttempts - 1;
      return NextResponse.json(
        { error: left > 0 ? `Código incorreto. Restam ${left} tentativa(s).` : 'Código incorreto. Peça um novo código.' },
        { status: 400 }
      );
    }

    const png = decodeSignaturePng(d.signature);
    if (!png) return NextResponse.json({ error: 'Assinatura inválida. Assine novamente no quadro.' }, { status: 400 });

    const done = await finalizeContractSignature({
      contract: c,
      signatureImage: png,
      typedCpf: d.cpf,
      method: 'REMOTE',
      ip: clientIp(request.headers),
      userAgent: request.headers.get('user-agent') || 'desconhecido',
    });
    return NextResponse.json({ ok: true, signedAt: done.signedAt });
  } catch (err) {
    if (err instanceof SignError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 });
    console.error('Erro na assinatura remota:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
