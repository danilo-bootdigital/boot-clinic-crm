import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { serializeReceivable } from '@/lib/api/financial-service';
import { prisma } from '@/lib/db/prisma';
import { ReceivableStatus } from '@prisma/client';

// GET /api/financeiro/patients/[patientId] — extrato financeiro do paciente.
// Alimenta a aba "Financeiro" da ficha: total faturado, total recebido, saldo
// em aberto e o histórico de cobranças (com as baixas de cada parcela).
export async function GET(_req: NextRequest, { params }: { params: { patientId: string } }) {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;

    // 1ª camada de escopo: o paciente precisa ser desta clínica.
    const patient = await prisma.patient.findFirst({
      where: { id: params.patientId, companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!patient) return NextResponse.json({ error: 'Paciente não encontrado' }, { status: 404 });

    const rows = await withFinanceTenant(companyId, (tx) =>
      tx.receivable.findMany({
        where: { companyId, patientId: patient.id, deletedAt: null },
        include: { installments: { orderBy: { number: 'asc' }, include: { payments: { orderBy: { paidAt: 'asc' } } } } },
        orderBy: { issueDate: 'desc' },
        take: 200,
      }),
    );

    const now = new Date();
    const receivables = rows.map((r) => serializeReceivable(r, now));
    const ativos = receivables.filter((r) => r.status !== ReceivableStatus.CANCELADO);
    const round = (n: number) => Number(n.toFixed(2));

    // Faturado (competência) e recebido (caixa) seguem separados aqui também —
    // criar cobrança não é receita recebida.
    return NextResponse.json({
      patientId: patient.id,
      patientName: patient.name,
      totals: {
        faturado: round(ativos.reduce((s, r) => s + r.finalAmount, 0)),
        recebido: round(ativos.reduce((s, r) => s + r.paidAmount, 0)),
        emAberto: round(ativos.reduce((s, r) => s + r.balance, 0)),
        vencido: round(
          ativos.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0),
        ),
        count: ativos.length,
      },
      receivables,
    });
  } catch (err) {
    console.error('Erro ao carregar financeiro do paciente:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
