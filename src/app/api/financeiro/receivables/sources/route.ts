import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { decToNumber } from '@/lib/api/financial-service';
import { attachPatientNames } from '@/lib/api/clinical-list';

// GET /api/financeiro/receivables/sources?patientId=
// Origens elegíveis p/ gerar receita: Orçamentos APPROVED e Contratos SIGNED que
// ainda NÃO possuem recebível ativo. Alimenta o formulário de criação.
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveFinanceUser('create');
    if (error) return error;
    const companyId = dbUser!.companyId;
    const patientId = new URL(request.url).searchParams.get('patientId') || undefined;

    const result = await withFinanceTenant(companyId, async (tx) => {
      const [quotes, contracts, usedReceivables] = await Promise.all([
        tx.clinicalQuote.findMany({
          where: { companyId, deletedAt: null, status: 'APPROVED', ...(patientId ? { patientId } : {}) },
          select: { id: true, patientId: true, title: true, total: true, approvedAt: true },
          orderBy: { approvedAt: 'desc' },
          take: 200,
        }),
        tx.patientContract.findMany({
          where: { companyId, deletedAt: null, status: 'SIGNED', ...(patientId ? { patientId } : {}) },
          select: { id: true, patientId: true, title: true, value: true, signedAt: true },
          orderBy: { signedAt: 'desc' },
          take: 200,
        }),
        tx.receivable.findMany({
          where: { companyId, deletedAt: null, OR: [{ quoteId: { not: null } }, { contractId: { not: null } }] },
          select: { quoteId: true, contractId: true },
        }),
      ]);
      const usedQuotes = new Set(usedReceivables.map((r) => r.quoteId).filter(Boolean));
      const usedContracts = new Set(usedReceivables.map((r) => r.contractId).filter(Boolean));
      return {
        quotes: quotes
          .filter((q) => !usedQuotes.has(q.id))
          .map((q) => ({ id: q.id, patientId: q.patientId, title: q.title, amount: q.total, date: q.approvedAt })),
        contracts: contracts
          .filter((c) => !usedContracts.has(c.id))
          .map((c) => ({ id: c.id, patientId: c.patientId, title: c.title, amount: decToNumber(c.value), date: c.signedAt })),
      };
    });

    const quotes = await attachPatientNames(result.quotes, companyId);
    const contracts = await attachPatientNames(result.contracts, companyId);
    return NextResponse.json({ quotes, contracts });
  } catch (err) {
    console.error('Erro ao listar origens de receita:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
