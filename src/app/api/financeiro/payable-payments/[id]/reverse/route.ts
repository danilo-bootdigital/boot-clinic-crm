import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { reversePayablePayment } from '@/lib/api/payable-service';
import { FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { ReversePayablePaymentSchema } from '@/lib/validations/financial';

// POST /api/financeiro/payable-payments/[id]/reverse — AÇÃO CRÍTICA (auditada).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('reverse');
    if (error) return error;
    const parsed = ReversePayablePaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Motivo obrigatório', details: parsed.error.flatten() }, { status: 400 });
    await withFinanceTenant(dbUser!.companyId, (tx) => reversePayablePayment(tx, dbUser!.companyId, dbUser!.id, params.id, parsed.data.reason));
    await writeAudit({ dbUser: dbUser!, action: 'REVERSE', entityType: 'PAYABLE_PAYMENT', entityId: params.id, newValues: { reason: parsed.data.reason }, request });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao estornar pagamento de saída:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
