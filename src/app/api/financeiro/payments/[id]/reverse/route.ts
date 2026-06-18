import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { reversePayment, FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { ReversePaymentSchema } from '@/lib/validations/financial';

// POST /api/financeiro/payments/[id]/reverse — AÇÃO CRÍTICA (auditada).
// RECEPTION NÃO pode estornar (capacidade 'reverse' restrita a OWNER/MANAGER/FINANCE).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('reverse');
    if (error) return error;
    const parsed = ReversePaymentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Motivo obrigatório', details: parsed.error.flatten() }, { status: 400 });
    }
    await withFinanceTenant(dbUser!.companyId, (tx) =>
      reversePayment(tx, dbUser!.companyId, dbUser!.id, params.id, parsed.data.reason),
    );
    await writeAudit({
      dbUser: dbUser!,
      action: 'REVERSE',
      entityType: 'INSTALLMENT_PAYMENT',
      entityId: params.id,
      newValues: { reason: parsed.data.reason },
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao estornar pagamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
