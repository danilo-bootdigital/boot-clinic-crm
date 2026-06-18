import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { serializePayable } from '@/lib/api/payable-service';

// GET /api/financeiro/payables/[id] — detalhe com pagamentos.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const row = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.payable.findFirst({
        where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
        include: { supplier: true, category: true, costCenter: true, payments: { orderBy: { paidAt: 'asc' } } },
      }),
    );
    if (!row) return NextResponse.json({ error: 'Conta a pagar não encontrada' }, { status: 404 });
    return NextResponse.json(serializePayable(row));
  } catch (err) {
    console.error('Erro ao buscar conta a pagar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
