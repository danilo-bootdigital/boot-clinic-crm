import { NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { decToNumber } from '@/lib/api/financial-service';
import { PayableStatus } from '@prisma/client';

// GET /api/financeiro/payables/summary — KPIs de Contas a Pagar (via aggregate SQL).
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;
    const now = new Date();
    const notCanceled = { deletedAt: null, status: { not: PayableStatus.CANCELADO } };

    const data = await withFinanceTenant(companyId, async (tx) => {
      const [grouped, open, overdue, paid] = await Promise.all([
        tx.payable.groupBy({ by: ['status'], where: { companyId, deletedAt: null }, _sum: { finalAmount: true }, _count: { _all: true } }),
        tx.payable.aggregate({ where: { companyId, ...notCanceled }, _sum: { finalAmount: true, paidAmount: true } }),
        tx.payable.aggregate({ where: { companyId, ...notCanceled, status: { in: [PayableStatus.PENDENTE, PayableStatus.PARCIAL] }, dueDate: { lt: now } }, _sum: { finalAmount: true, paidAmount: true } }),
        tx.payablePayment.aggregate({ where: { companyId, reversedAt: null, payable: notCanceled }, _sum: { amount: true } }),
      ]);
      return { grouped, open, overdue, paid };
    });

    const byStatus: Record<string, number> = {};
    let totalAReceberCount = 0;
    for (const g of data.grouped) { byStatus[g.status] = g._count._all; totalAReceberCount += g._count._all; }
    const round = (n: number) => Number(n.toFixed(2));
    const aPagar = decToNumber(data.open._sum.finalAmount) - decToNumber(data.open._sum.paidAmount);
    const vencido = decToNumber(data.overdue._sum.finalAmount) - decToNumber(data.overdue._sum.paidAmount);

    return NextResponse.json({
      totalDespesas: round(decToNumber(data.open._sum.finalAmount)),
      pago: round(decToNumber(data.paid._sum.amount)),
      aPagar: round(aPagar),
      vencido: round(vencido),
      totalContas: totalAReceberCount,
      byStatus,
    });
  } catch (err) {
    console.error('Erro no resumo de Contas a Pagar:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
