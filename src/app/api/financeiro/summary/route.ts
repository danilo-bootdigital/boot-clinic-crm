import { NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { decToNumber } from '@/lib/api/financial-service';
import { ReceivableStatus, InstallmentStatus } from '@prisma/client';

// GET /api/financeiro/summary — KPIs do dashboard financeiro (Contas a Receber).
// Tudo via AGREGAÇÃO SQL (O(1) de transferência) — não materializa linhas em JS.
// Cancelados são excluídos de todos os KPIs (inclusive "recebido").
export async function GET() {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;
    const now = new Date();
    const notCanceledReceivable = { deletedAt: null, status: { not: ReceivableStatus.CANCELADO } };

    const data = await withFinanceTenant(companyId, async (tx) => {
      const [grouped, openAgg, overdueAgg, paid] = await Promise.all([
        // Faturado + contagem por status (GROUP BY).
        tx.receivable.groupBy({
          by: ['status'],
          where: { companyId, deletedAt: null },
          _sum: { finalAmount: true },
          _count: { _all: true },
        }),
        // Em aberto: saldo (amount - paidAmount) de parcelas não canceladas.
        tx.receivableInstallment.aggregate({
          where: { companyId, status: { not: InstallmentStatus.CANCELADO }, receivable: notCanceledReceivable },
          _sum: { amount: true, paidAmount: true },
        }),
        // Vencido: idem, com vencimento no passado e ainda em aberto.
        tx.receivableInstallment.aggregate({
          where: {
            companyId,
            status: { in: [InstallmentStatus.PENDENTE, InstallmentStatus.PARCIAL] },
            dueDate: { lt: now },
            receivable: notCanceledReceivable,
          },
          _sum: { amount: true, paidAmount: true },
        }),
        // Recebido: pagamentos não estornados de recebíveis NÃO cancelados (SVC-1).
        tx.installmentPayment.aggregate({
          where: { companyId, reversedAt: null, installment: { receivable: notCanceledReceivable } },
          _sum: { amount: true },
        }),
      ]);
      return { grouped, openAgg, overdueAgg, paid };
    });

    const byStatus: Record<string, number> = {};
    let faturado = 0;
    let totalRecebiveis = 0;
    let nonCanceledCount = 0;
    for (const g of data.grouped) {
      byStatus[g.status] = g._count._all;
      totalRecebiveis += g._count._all;
      if (g.status !== ReceivableStatus.CANCELADO) {
        faturado += decToNumber(g._sum.finalAmount);
        nonCanceledCount += g._count._all;
      }
    }
    const emAberto = decToNumber(data.openAgg._sum.amount) - decToNumber(data.openAgg._sum.paidAmount);
    const vencido = decToNumber(data.overdueAgg._sum.amount) - decToNumber(data.overdueAgg._sum.paidAmount);
    const recebido = decToNumber(data.paid._sum.amount);

    const round = (n: number) => Number(n.toFixed(2));
    return NextResponse.json({
      faturado: round(faturado),
      recebido: round(recebido),
      emAberto: round(emAberto),
      vencido: round(vencido),
      ticketMedio: nonCanceledCount ? round(faturado / nonCanceledCount) : 0,
      totalRecebiveis,
      byStatus,
    });
  } catch (err) {
    console.error('Erro ao calcular resumo financeiro:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
