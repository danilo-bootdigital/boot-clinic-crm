import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { UpdatePatientContractSchema } from '@/lib/validations/clinical';
import { serializeContract } from '@/lib/contracts/serialize';

async function findOwned(id: string, companyId: string) {
  return prisma.patientContract.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'view');
    if (error) return error;
    const row = await findOwned(params.id, dbUser!.companyId);
    if (!row) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    return NextResponse.json(serializeContract(row));
  } catch (err) {
    console.error('Erro ao buscar contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - atualiza dados/status. Carimba datas conforme a transição de status.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    const d = UpdatePatientContractSchema.parse(await request.json());

    // Assinado é imutável: o PDF e o hash provam o texto que foi assinado.
    if (existing.status === 'SIGNED') {
      return NextResponse.json({ error: 'Contrato assinado não pode ser alterado.' }, { status: 409 });
    }
    // "Assinado" e "Enviado" só pelos fluxos reais (assinatura / link).
    if (d.status === 'SIGNED' || d.status === 'SENT') {
      return NextResponse.json(
        { error: 'Use "Assinar presencialmente" ou "Enviar link" para mudar este status.' },
        { status: 400 }
      );
    }
    // Com link na mão do paciente, o texto não muda — senão ele assinaria uma
    // versão diferente da que leu. Para corrigir: cancelar e gerar outro.
    const mudaTexto = (d.title !== undefined && d.title !== existing.title) || (d.content !== undefined && d.content !== existing.content);
    if (existing.status !== 'DRAFT' && mudaTexto) {
      return NextResponse.json(
        { error: 'O texto não pode mudar depois do envio. Cancele e gere um novo contrato.' },
        { status: 409 }
      );
    }

    const statusStamp: any = {};
    if (d.status && d.status !== existing.status) {
      if (d.status === 'CANCELED') {
        statusStamp.canceledAt = new Date();
        // Cancelar derruba o link: quem tiver a mensagem não consegue mais assinar.
        statusStamp.signTokenHash = null;
        statusStamp.otpHash = null;
      }
    }

    const row = await prisma.patientContract.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.content !== undefined && { content: d.content }),
        ...(d.variables !== undefined && { variables: d.variables }),
        ...(d.value !== undefined && { value: d.value }),
        ...(d.status !== undefined && { status: d.status }),
        ...statusStamp,
      },
    });
    await writeAudit({
      dbUser: dbUser!, action: 'UPDATE', entityType: 'CONTRACT', entityId: params.id,
      oldValues: { status: existing.status }, newValues: { status: row.status }, request,
    });
    return NextResponse.json(serializeContract(row));
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });
    if (existing.status === 'SIGNED') {
      return NextResponse.json({ error: 'Contrato assinado não pode ser excluído.' }, { status: 409 });
    }
    await prisma.patientContract.update({ where: { id: params.id }, data: { deletedAt: new Date(), signTokenHash: null, otpHash: null } });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'CONTRACT', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
