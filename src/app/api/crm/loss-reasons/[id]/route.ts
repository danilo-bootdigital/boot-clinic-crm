import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { findLossReason, lossReasonNameTaken } from '@/lib/crm/loss-reasons';

// PATCH  — renomeia o motivo (o histórico segue apontando para a mesma linha).
// DELETE — remoção REVERSÍVEL: sai da lista de escolha, mas os negócios já
//          perdidos continuam mostrando o motivo.

export const dynamic = 'force-dynamic';

const UpdateSchema = z.object({ name: z.string().trim().min(1, 'Nome é obrigatório').max(60) });

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'edit');
    if (denied) return denied;

    const existing = await findLossReason(dbUser!.companyId, params.id);
    if (!existing) return NextResponse.json({ error: 'Motivo não encontrado' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());
    if (await lossReasonNameTaken(dbUser!.companyId, d.name, params.id)) {
      return NextResponse.json({ error: 'Já existe um motivo com esse nome' }, { status: 409 });
    }

    const reason = await prisma.dealLossReason.update({
      where: { id: params.id },
      data: { name: d.name },
      select: { id: true, name: true, order: true },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.DEAL_LOSS_REASON,
      entityId: reason.id,
      oldValues: { motivoDePerda: existing.name },
      newValues: { motivoDePerda: reason.name },
      request,
    });

    return NextResponse.json(reason);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao renomear motivo de perda:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'edit');
    if (denied) return denied;

    const existing = await findLossReason(dbUser!.companyId, params.id);
    if (!existing) return NextResponse.json({ error: 'Motivo não encontrado' }, { status: 404 });

    // Lista vazia bloquearia o perdido: exigimos motivo, então tem que sobrar um.
    const restantes = await prisma.dealLossReason.count({
      where: { companyId: dbUser!.companyId, deletedAt: null, NOT: { id: params.id } },
    });
    if (restantes === 0) {
      return NextResponse.json(
        { error: 'Deixe pelo menos um motivo cadastrado — o perdido exige escolher um.' },
        { status: 409 }
      );
    }

    const emUso = await prisma.deal.count({
      where: { companyId: dbUser!.companyId, lossReasonId: params.id },
    });

    await prisma.dealLossReason.update({ where: { id: params.id }, data: { deletedAt: new Date() } });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.DELETE,
      entityType: EntityType.DEAL_LOSS_REASON,
      entityId: params.id,
      oldValues: { motivoDePerda: existing.name, negociosQueUsam: emUso },
      request,
    });

    // `emUso` volta para a tela poder dizer que o histórico foi preservado.
    return NextResponse.json({ success: true, dealsComEsseMotivo: emUso });
  } catch (err) {
    console.error('Erro ao remover motivo de perda:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
