import { NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { decToNumber } from '@/lib/api/financial-service';
import { ReceivableStatus, InstallmentStatus, PayableStatus } from '@prisma/client';

// GET /api/financeiro/dashboard — KPIs executivos consolidados (competência + caixa).
// Tudo via aggregate SQL; cancelados/excluídos fora. Escopo por empresa (RLS + companyId).
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;
    const now = new Date();
    const recOk = { deletedAt: null, status: { not: ReceivableStatus.CANCELADO } };
    const payOk = { deletedAt: null, status: { not: PayableStatus.CANCELADO } };

    const d = await withFinanceTenant(companyId, async (tx) => {
      const [rec, open, overdue, recebidoAgg, pay, pagoAgg] = await Promise.all([
        // Receita: bruta (original), descontos, líquida (final) + nº de recebíveis.
        tx.receivable.aggregate({ where: { companyId, ...recOk }, _sum: { originalAmount: true, discountAmount: true, finalAmount: true }, _count: { _all: true } }),
        // Em aberto: saldo de parcelas não canceladas.
        tx.receivableInstallment.aggregate({ where: { companyId, status: { not: InstallmentStatus.CANCELADO }, receivable: recOk }, _sum: { amount: true, paidAmount: true } }),
        // Inadimplência: saldo de parcelas vencidas e em aberto.
        tx.receivableInstallment.aggregate({ where: { companyId, status: { in: [InstallmentStatus.PENDENTE, InstallmentStatus.PARCIAL] }, dueDate: { lt: now }, receivable: recOk }, _sum: { amount: true, paidAmount: true } }),
        // Recebido (caixa): pagamentos não estornados de recebíveis não cancelados.
        tx.installmentPayment.aggregate({ where: { companyId, reversedAt: null, installment: { receivable: recOk } }, _sum: { amount: true } }),
        // Despesas (competência): final de contas a pagar não canceladas.
        tx.payable.aggregate({ where: { companyId, ...payOk }, _sum: { finalAmount: true } }),
        // Pago (caixa): pagamentos de saída não estornados de contas não canceladas.
        tx.payablePayment.aggregate({ where: { companyId, reversedAt: null, payable: payOk }, _sum: { amount: true } }),
      ]);
      return { rec, open, overdue, recebidoAgg, pay, pagoAgg };
    });

    const round = (n: number) => Number(n.toFixed(2));
    const receitaBruta = decToNumber(d.rec._sum.originalAmount);
    const descontos = decToNumber(d.rec._sum.discountAmount);
    const receitaLiquida = decToNumber(d.rec._sum.finalAmount);
    const qtdRecebiveis = d.rec._count._all;
    const emAberto = decToNumber(d.open._sum.amount) - decToNumber(d.open._sum.paidAmount);
    const inadimplencia = decToNumber(d.overdue._sum.amount) - decToNumber(d.overdue._sum.paidAmount);
    const recebido = decToNumber(d.recebidoAgg._sum.amount);
    const despesas = decToNumber(d.pay._sum.finalAmount);
    const pago = decToNumber(d.pagoAgg._sum.amount);

    return NextResponse.json({
      receitaBruta: round(receitaBruta),
      descontos: round(descontos),
      receitaLiquida: round(receitaLiquida),
      recebido: round(recebido),
      emAberto: round(emAberto),
      inadimplencia: round(inadimplencia),
      inadimplenciaPct: receitaLiquida > 0 ? round((inadimplencia / receitaLiquida) * 100) : 0,
      ticketMedio: qtdRecebiveis > 0 ? round(receitaLiquida / qtdRecebiveis) : 0,
      despesas: round(despesas),
      pago: round(pago),
      // Resultado operacional (competência) = receita líquida − despesas.
      resultadoOperacional: round(receitaLiquida - despesas),
      // Resultado de caixa (realizado) = recebido − pago.
      resultadoCaixa: round(recebido - pago),
      qtdRecebiveis,
    });
  } catch (err) {
    console.error('Erro no dashboard financeiro:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
