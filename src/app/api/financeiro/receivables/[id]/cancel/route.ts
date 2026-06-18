import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { cancelReceivable, FinancialError } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { CancelReceivableSchema } from '@/lib/validations/financial';

// POST /api/financeiro/receivables/[id]/cancel — AÇÃO CRÍTICA (auditada).
// Apenas papéis com capacidade 'cancel' (OWNER/MANAGER/FINANCE/SUPER_ADMIN).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('cancel');
    if (error) return error;
    const parsed = CancelReceivableSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Motivo obrigatório', details: parsed.error.flatten() }, { status: 400 });
    }
    await withFinanceTenant(dbUser!.companyId, (tx) =>
      cancelReceivable(tx, dbUser!.companyId, params.id, parsed.data.reason),
    );
    await writeAudit({
      dbUser: dbUser!,
      action: 'CANCEL',
      entityType: 'RECEIVABLE',
      entityId: params.id,
      newValues: { reason: parsed.data.reason },
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof FinancialError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Erro ao cancelar recebível:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
