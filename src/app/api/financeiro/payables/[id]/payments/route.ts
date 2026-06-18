import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { registerPayablePayment } from '@/lib/api/payable-service';
import { FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { RegisterPayablePaymentSchema } from '@/lib/validations/financial';

// POST /api/financeiro/payables/[id]/payments — registra baixa (saída).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('settle');
    if (error) return error;
    const parsed = RegisterPayablePaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    const payment = await withFinanceTenant(dbUser!.companyId, (tx) =>
      registerPayablePayment(tx, dbUser!.companyId, dbUser!.id, params.id, parsed.data),
    );
    await writeAudit({ dbUser: dbUser!, action: 'SETTLE', entityType: 'PAYABLE_PAYMENT', entityId: payment.id, newValues: { payableId: params.id, amount: payment.amount, method: payment.method }, request });
    return NextResponse.json({ id: payment.id, ok: true }, { status: 201 });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao registrar pagamento de saída:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
