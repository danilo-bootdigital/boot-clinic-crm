import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { clientIp, decodeSignaturePng } from '@/lib/contracts/signing';
import { finalizeContractSignature, SignError } from '@/lib/contracts/finalize';

// POST /api/clinico/contracts/[id]/sign — assinatura PRESENCIAL, no dispositivo
// da clínica. Sem código no WhatsApp: a identidade é conferida pela atendente,
// que fica registrada como quem conduziu. O CPF digitado ainda tem que bater.
const Schema = z.object({
  signature: z.string().min(1, 'Assinatura é obrigatória'),
  cpf: z.string().min(11, 'CPF é obrigatório'),
  accepted: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos' }) }),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const contract = await prisma.patientContract.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

    const d = Schema.parse(await request.json());
    const png = decodeSignaturePng(d.signature);
    if (!png) return NextResponse.json({ error: 'Assinatura inválida. Assine novamente no quadro.' }, { status: 400 });

    const done = await finalizeContractSignature({
      contract,
      signatureImage: png,
      typedCpf: d.cpf,
      method: 'IN_PERSON',
      ip: clientIp(request.headers),
      userAgent: request.headers.get('user-agent') || 'desconhecido',
      conductedBy: { id: dbUser!.id, name: dbUser!.name },
    });
    return NextResponse.json({ ok: true, signedAt: done.signedAt });
  } catch (err) {
    if (err instanceof SignError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 });
    console.error('Erro na assinatura presencial:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
