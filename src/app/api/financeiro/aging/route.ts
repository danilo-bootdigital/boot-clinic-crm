import { NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { toCents, decToNumber } from '@/lib/api/financial-service';
import { attachPatientNames } from '@/lib/api/clinical-list';
import { ReceivableStatus, InstallmentStatus } from '@prisma/client';

// GET /api/financeiro/aging — relatório de INADIMPLÊNCIA (Fase 9).
// Aging das parcelas VENCIDAS e em aberto (PENDENTE/PARCIAL, dueDate < hoje) de
// recebíveis não cancelados, bucketizadas por dias de atraso, e consolidadas por
// paciente. Escopo por empresa (RLS + companyId). Tudo em centavos internamente.
//
// Trabalha só sobre o SUBCONJUNTO inadimplente (não materializa todos os
// recebíveis) — necessário materializar as linhas vencidas porque o aging exige
// aritmética de data por parcela e o detalhamento por paciente.

const BUCKETS = [
  { key: 'b30', label: 'Até 30 dias', min: 0, max: 30 },
  { key: 'b60', label: '31–60 dias', min: 31, max: 60 },
  { key: 'b90', label: '61–90 dias', min: 61, max: 90 },
  { key: 'b120', label: '91–120 dias', min: 91, max: 120 },
  { key: 'b120p', label: '120+ dias', min: 121, max: Infinity },
] as const;

type BucketKey = (typeof BUCKETS)[number]['key'];

function bucketOf(daysLate: number): BucketKey {
  for (const b of BUCKETS) if (daysLate >= b.min && daysLate <= b.max) return b.key;
  return 'b120p';
}

const DAY_MS = 86_400_000;

export async function GET() {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;
    const now = new Date();

    const rows = await withFinanceTenant(companyId, (tx) =>
      tx.receivableInstallment.findMany({
        where: {
          companyId,
          status: { in: [InstallmentStatus.PENDENTE, InstallmentStatus.PARCIAL] },
          dueDate: { lt: now },
          receivable: { deletedAt: null, status: { not: ReceivableStatus.CANCELADO } },
        },
        select: {
          amount: true,
          paidAmount: true,
          dueDate: true,
          receivable: { select: { patientId: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
    );

    // Acumuladores em CENTAVOS.
    const buckets: Record<BucketKey, { count: number; cents: number }> = {
      b30: { count: 0, cents: 0 },
      b60: { count: 0, cents: 0 },
      b90: { count: 0, cents: 0 },
      b120: { count: 0, cents: 0 },
      b120p: { count: 0, cents: 0 },
    };
    type PatientAgg = {
      patientId: string;
      cents: number;
      count: number;
      oldestDays: number;
      buckets: Record<BucketKey, number>; // saldo (centavos) por faixa
    };
    const byPatient = new Map<string, PatientAgg>();
    let totalCents = 0;
    let totalCount = 0;

    for (const r of rows) {
      const balanceCents = toCents(decToNumber(r.amount)) - toCents(decToNumber(r.paidAmount));
      if (balanceCents <= 0) continue; // parcela sem saldo não é inadimplência.
      const daysLate = Math.max(0, Math.floor((now.getTime() - r.dueDate.getTime()) / DAY_MS));
      const key = bucketOf(daysLate);

      buckets[key].count += 1;
      buckets[key].cents += balanceCents;
      totalCents += balanceCents;
      totalCount += 1;

      const pid = r.receivable.patientId;
      let agg = byPatient.get(pid);
      if (!agg) {
        agg = { patientId: pid, cents: 0, count: 0, oldestDays: 0, buckets: { b30: 0, b60: 0, b90: 0, b120: 0, b120p: 0 } };
        byPatient.set(pid, agg);
      }
      agg.cents += balanceCents;
      agg.count += 1;
      agg.buckets[key] += balanceCents;
      if (daysLate > agg.oldestDays) agg.oldestDays = daysLate;
    }

    const fromCents = (c: number) => Number((c / 100).toFixed(2));

    // Lista por paciente (com nome), ordenada por saldo em atraso desc.
    const patientList = Array.from(byPatient.values()).sort((a, b) => b.cents - a.cents);
    const named = await attachPatientNames(
      patientList.map((p) => ({ ...p, patientId: p.patientId })),
      companyId,
    );

    return NextResponse.json({
      total: fromCents(totalCents),
      totalCount,
      patientCount: byPatient.size,
      oldestDays: patientList.reduce((m, p) => Math.max(m, p.oldestDays), 0),
      buckets: BUCKETS.map((b) => ({
        key: b.key,
        label: b.label,
        count: buckets[b.key].count,
        total: fromCents(buckets[b.key].cents),
      })),
      patients: named.map((p) => ({
        patientId: p.patientId,
        patientName: p.patientName,
        total: fromCents(p.cents),
        count: p.count,
        oldestDays: p.oldestDays,
        buckets: {
          b30: fromCents(p.buckets.b30),
          b60: fromCents(p.buckets.b60),
          b90: fromCents(p.buckets.b90),
          b120: fromCents(p.buckets.b120),
          b120p: fromCents(p.buckets.b120p),
        },
      })),
    });
  } catch (err) {
    console.error('Erro no relatório de inadimplência:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
