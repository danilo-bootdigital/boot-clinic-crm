import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { createPayable, serializePayable } from '@/lib/api/payable-service';
import { FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { CreatePayableSchema } from '@/lib/validations/financial';
import { PayableStatus, Prisma } from '@prisma/client';

const VALID = new Set(Object.values(PayableStatus));

// GET /api/financeiro/payables?status=&supplierId=&overdue=1
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    if (status && !VALID.has(status as PayableStatus)) return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    const supplierId = searchParams.get('supplierId') || undefined;
    const onlyOverdue = searchParams.get('overdue') === '1';
    const now = new Date();

    const where: Prisma.PayableWhereInput = {
      companyId: dbUser!.companyId,
      deletedAt: null,
      ...(status ? { status: status as PayableStatus } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(onlyOverdue ? { status: { in: [PayableStatus.PENDENTE, PayableStatus.PARCIAL] }, dueDate: { lt: now } } : {}),
    };
    const rows = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.payable.findMany({ where, include: { supplier: true, category: true, costCenter: true }, orderBy: { dueDate: 'asc' }, take: 300 }),
    );
    return NextResponse.json(rows.map((r) => serializePayable(r, now)));
  } catch (err) {
    console.error('Erro ao listar contas a pagar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/financeiro/payables — cria despesa.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = CreatePayableSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      createPayable(tx, dbUser!.companyId, dbUser!.id, parsed.data),
    );
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'PAYABLE', entityId: created.id, newValues: { id: created.id, finalAmount: created.finalAmount }, request });
    return NextResponse.json(serializePayable(created), { status: 201 });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao criar conta a pagar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
