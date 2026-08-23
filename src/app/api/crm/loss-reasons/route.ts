import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { listLossReasons, lossReasonNameTaken } from '@/lib/crm/loss-reasons';

// Cadastro de motivos de perda da clínica.
//
// GET  — motivos ativos, na ordem de exibição (semeia os padrões na 1ª vez).
// POST — cadastra um motivo novo, no fim da lista.

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({ name: z.string().trim().min(1, 'Nome é obrigatório').max(60) });

export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'view');
    if (denied) return denied;

    return NextResponse.json(await listLossReasons(dbUser!.companyId));
  } catch (err) {
    console.error('Erro ao listar motivos de perda:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('crm');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'crm', 'edit');
    if (denied) return denied;

    const d = CreateSchema.parse(await request.json());
    if (await lossReasonNameTaken(dbUser!.companyId, d.name)) {
      return NextResponse.json({ error: 'Já existe um motivo com esse nome' }, { status: 409 });
    }

    // Entra no fim da lista: ordem é decisão de quem cadastra, não do alfabeto.
    const last = await prisma.dealLossReason.findFirst({
      where: { companyId: dbUser!.companyId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const reason = await prisma.dealLossReason.create({
      data: { companyId: dbUser!.companyId, name: d.name, order: (last?.order ?? -1) + 1 },
      select: { id: true, name: true, order: true },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.CREATE,
      entityType: EntityType.DEAL_LOSS_REASON,
      entityId: reason.id,
      newValues: { motivoDePerda: reason.name },
      request,
    });

    return NextResponse.json(reason, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao cadastrar motivo de perda:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
