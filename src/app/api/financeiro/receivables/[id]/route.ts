import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { serializeReceivable } from '@/lib/api/financial-service';
import { attachPatientNames } from '@/lib/api/clinical-list';

// GET /api/financeiro/receivables/[id] — detalhe com parcelas e pagamentos.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const row = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.receivable.findFirst({
        where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
        include: {
          installments: {
            orderBy: { number: 'asc' },
            include: { payments: { orderBy: { paidAt: 'asc' } } },
          },
        },
      }),
    );
    if (!row) return NextResponse.json({ error: 'Recebível não encontrado' }, { status: 404 });
    const [withName] = await attachPatientNames([serializeReceivable(row)], dbUser!.companyId);
    return NextResponse.json(withName);
  } catch (err) {
    console.error('Erro ao buscar recebível:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
