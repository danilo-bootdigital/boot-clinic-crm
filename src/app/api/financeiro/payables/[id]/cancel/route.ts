import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { cancelPayable } from '@/lib/api/payable-service';
import { FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { CancelPayableSchema } from '@/lib/validations/financial';

// POST /api/financeiro/payables/[id]/cancel — AÇÃO CRÍTICA (auditada).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('cancel');
    if (error) return error;
    const parsed = CancelPayableSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Motivo obrigatório', details: parsed.error.flatten() }, { status: 400 });
    await withFinanceTenant(dbUser!.companyId, (tx) => cancelPayable(tx, dbUser!.companyId, params.id, parsed.data.reason));
    await writeAudit({ dbUser: dbUser!, action: 'CANCEL', entityType: 'PAYABLE', entityId: params.id, newValues: { reason: parsed.data.reason }, request });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao cancelar conta a pagar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
