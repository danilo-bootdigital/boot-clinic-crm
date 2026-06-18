import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { registerPayment, FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { RegisterPaymentSchema } from '@/lib/validations/financial';

// POST /api/financeiro/installments/[id]/payments — registra baixa (RECEPTION pode).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('settle');
    if (error) return error;
    const parsed = RegisterPaymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const payment = await withFinanceTenant(dbUser!.companyId, (tx) =>
      registerPayment(tx, dbUser!.companyId, dbUser!.id, params.id, parsed.data),
    );
    await writeAudit({
      dbUser: dbUser!,
      action: 'SETTLE',
      entityType: 'INSTALLMENT_PAYMENT',
      entityId: payment.id,
      newValues: { installmentId: params.id, amount: payment.amount, method: payment.method },
      request,
    });
    return NextResponse.json({ id: payment.id, ok: true }, { status: 201 });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao registrar pagamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
