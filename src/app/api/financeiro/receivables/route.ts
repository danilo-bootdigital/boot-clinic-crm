import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { createReceivable, serializeReceivable, FinancialError } from '@/lib/api/financial-service';
import { attachPatientNames } from '@/lib/api/clinical-list';
import { writeAudit } from '@/lib/api/audit';
import { CreateReceivableSchema } from '@/lib/validations/financial';
import { ReceivableStatus, InstallmentStatus, Prisma } from '@prisma/client';

const VALID_STATUS = new Set(Object.values(ReceivableStatus));

// GET /api/financeiro/receivables?status=&patientId=&overdue=1
// Lista recebíveis da clínica (com parcelas e nome do paciente). "Vencido" é
// filtrado no BANCO (parcela vencida em aberto), não em memória após o take.
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || undefined;
    if (statusParam && !VALID_STATUS.has(statusParam as ReceivableStatus)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }
    const patientId = searchParams.get('patientId') || undefined;
    const onlyOverdue = searchParams.get('overdue') === '1';
    const now = new Date();

    const where: Prisma.ReceivableWhereInput = {
      companyId: dbUser!.companyId,
      deletedAt: null,
      ...(statusParam ? { status: statusParam as ReceivableStatus } : {}),
      ...(patientId ? { patientId } : {}),
      ...(onlyOverdue
        ? {
            status: { in: [ReceivableStatus.PENDENTE, ReceivableStatus.PARCIAL] },
            installments: { some: { dueDate: { lt: now }, status: { in: [InstallmentStatus.PENDENTE, InstallmentStatus.PARCIAL] } } },
          }
        : {}),
    };

    const rows = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.receivable.findMany({
        where,
        include: { installments: { orderBy: { number: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    );
    const serialized = rows.map((r) => serializeReceivable(r, now));
    return NextResponse.json(await attachPatientNames(serialized, dbUser!.companyId));
  } catch (err) {
    console.error('Erro ao listar recebíveis:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/financeiro/receivables — cria recebível + parcelas (transacional).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveFinanceUser('create');
    if (error) return error;
    const parsed = CreateReceivableSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      createReceivable(tx, dbUser!.companyId, dbUser!.id, parsed.data),
    );
    await writeAudit({
      dbUser: dbUser!,
      action: 'CREATE',
      entityType: 'RECEIVABLE',
      entityId: created.id,
      newValues: { id: created.id, finalAmount: created.finalAmount, installments: created.installments.length },
      request,
    });
    return NextResponse.json(serializeReceivable(created), { status: 201 });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Receita já existente para esta origem' }, { status: 409 });
    console.error('Erro ao criar recebível:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
