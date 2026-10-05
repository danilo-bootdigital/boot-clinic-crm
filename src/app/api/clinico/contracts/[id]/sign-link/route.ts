import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { sendWhatsappForCompany } from '@/lib/messaging/adapters/whatsapp/evolution';
import { SIGN_LINK_TTL_DAYS, newSignToken, signLinkUrl, maskPhone } from '@/lib/contracts/signing';

// POST /api/clinico/contracts/[id]/sign-link — gera o link de assinatura e manda
// no WhatsApp do paciente. Gerar de novo INVALIDA o link anterior (o hash é
// trocado) e zera o código: vale sempre só a última mensagem enviada.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const contract = await prisma.patientContract.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    if (contract.status === 'SIGNED') return NextResponse.json({ error: 'Este contrato já foi assinado.' }, { status: 409 });
    if (contract.status === 'CANCELED') return NextResponse.json({ error: 'Este contrato foi cancelado.' }, { status: 409 });

    const patient = await prisma.patient.findFirst({
      where: { id: contract.patientId, companyId: dbUser!.companyId },
      select: { id: true, name: true, phone: true, whatsapp: true },
    });
    if (!patient) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });
    const phone = patient.whatsapp || patient.phone;

    const { token, hash } = newSignToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SIGN_LINK_TTL_DAYS * 86_400_000);
    await prisma.patientContract.update({
      where: { id: contract.id },
      data: {
        status: 'SENT',
        sentAt: now,
        signTokenHash: hash,
        signTokenExpiresAt: expiresAt,
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpSendCount: 0,
        otpLastSentAt: null,
      },
    });

    const link = signLinkUrl(token, request.nextUrl.origin);
    const company = await prisma.company.findUnique({ where: { id: dbUser!.companyId }, select: { name: true } });
    const first = patient.name.split(' ')[0];
    const text =
      `Olá, ${first}! A ${company?.name ?? 'clínica'} enviou o contrato "${contract.title}" para você assinar.\n\n` +
      `Abra o link, leia com calma e assine pelo celular:\n${link}\n\n` +
      `Para confirmar que é você, vamos enviar um código por aqui na hora de assinar. O link vale por ${SIGN_LINK_TTL_DAYS} dias.`;

    const sent = phone ? await sendWhatsappForCompany(dbUser!.companyId, phone, text) : { configured: true, ok: false, error: 'Paciente sem telefone/WhatsApp no cadastro.' };

    await Promise.allSettled([
      prisma.timelineEvent.create({
        data: {
          title: 'Contrato enviado para assinatura',
          content: sent.ok
            ? `"${contract.title}" enviado por WhatsApp para ${maskPhone(phone)}.`
            : `Link de assinatura de "${contract.title}" gerado; envio por WhatsApp não concluído (${sent.error ?? 'WhatsApp não configurado'}).`,
          type: 'WHATSAPP',
          patientId: patient.id,
          userId: dbUser!.id,
        },
      }),
      writeAudit({
        dbUser: dbUser!, action: 'SEND_WHATSAPP', entityType: 'CONTRACT', entityId: contract.id,
        newValues: { status: 'SENT', whatsappSent: sent.ok, expiresAt }, request,
      }),
    ]);

    return NextResponse.json({
      link,
      expiresAt,
      sent: sent.ok,
      sentTo: phone ? maskPhone(phone) : null,
      // Sem envio, a atendente ainda pode copiar o link e mandar por outro meio.
      error: sent.ok ? null : sent.error ?? 'WhatsApp não configurado para esta clínica.',
    });
  } catch (err) {
    console.error('Erro ao gerar link de assinatura:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
