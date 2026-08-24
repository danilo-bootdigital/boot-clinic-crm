import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD — agregados reais do período (escopo da empresa).
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'dashboard', 'view');
    if (denied) return denied;
    const companyId = dbUser!.companyId;

    const sp = request.nextUrl.searchParams;
    const today = new Date();
    const defFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromStr = sp.get('from') || defFrom.toISOString().split('T')[0];
    const toStr = sp.get('to') || today.toISOString().split('T')[0];
    const from = new Date(`${fromStr}T00:00:00`);
    const to = new Date(`${toStr}T00:00:00`); to.setDate(to.getDate() + 1); // fim inclusivo
    const range = { gte: from, lt: to };

    const [
      patientsNew, patientsActive, patientsByOrigin,
      dealsCreated, dealsWon, dealsLost, dealsWonValue,
      apptByStatus, apptAttended, apptTotal,
      fuCreated, fuCompleted,
    ] = await Promise.all([
      prisma.patient.count({ where: { companyId, deletedAt: null, createdAt: range } }),
      prisma.patient.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      prisma.patient.groupBy({ by: ['origin'], _count: true, where: { companyId, deletedAt: null, createdAt: range } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, createdAt: range } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, status: 'WON', wonAt: range } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, status: 'LOST', lostAt: range } }),
      prisma.deal.aggregate({ _sum: { valueEstimated: true }, where: { companyId, deletedAt: null, status: 'WON', wonAt: range } }),
      prisma.appointment.groupBy({ by: ['status'], _count: true, where: { companyId, deletedAt: null, startAt: range } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: 'ATTENDED', startAt: range } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, startAt: range } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, createdAt: range } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, status: 'COMPLETED', completedAt: range } }),
    ]);

    // Perdas POR MOTIVO. "Perdemos 12" não muda decisão nenhuma; "8 por preço e
    // 4 por distância" muda — a primeira é contagem, a segunda é diagnóstico.
    // groupBy devolve id; o nome vem numa segunda consulta em lote (sem N+1), e
    // SEM filtrar motivo removido: motivo aposentado depois da perda continua
    // sendo o motivo daquela perda.
    const lossGroups = await prisma.deal.groupBy({
      by: ['lossReasonId'],
      _count: true,
      _sum: { valueEstimated: true },
      where: { companyId, deletedAt: null, status: 'LOST', lostAt: range },
    });
    const lossReasonIds = lossGroups.map((g) => g.lossReasonId).filter(Boolean) as string[];
    const lossReasonRows = lossReasonIds.length
      ? await prisma.dealLossReason.findMany({
          where: { id: { in: lossReasonIds }, companyId },
          select: { id: true, name: true },
        })
      : [];
    const lossNames = new Map(lossReasonRows.map((r) => [r.id, r.name]));
    const lossByReason = lossGroups
      .map((g) => ({
        reasonId: g.lossReasonId,
        // Perda antiga, de antes da regra do motivo obrigatório: aparece como
        // "Sem motivo registrado" em vez de sumir da conta.
        name: g.lossReasonId ? lossNames.get(g.lossReasonId) ?? 'Motivo removido' : 'Sem motivo registrado',
        count: (g as any)._count as number,
        value: g._sum.valueEstimated ?? 0,
      }))
      .sort((a, b) => b.count - a.count);

    const byOrigin: Record<string, number> = {};
    for (const r of patientsByOrigin) byOrigin[r.origin] = (r as any)._count;
    const apptStatus: Record<string, number> = {};
    for (const r of apptByStatus) apptStatus[r.status] = (r as any)._count;
    const noShow = apptStatus['NO_SHOW'] || 0;

    return NextResponse.json({
      period: { from: fromStr, to: toStr },
      patients: { newInPeriod: patientsNew, activeTotal: patientsActive, byOrigin },
      crm: {
        created: dealsCreated, won: dealsWon, lost: dealsLost,
        wonValue: dealsWonValue._sum.valueEstimated ?? 0,
        conversionRate: dealsWon + dealsLost > 0 ? Math.round((dealsWon / (dealsWon + dealsLost)) * 100) : 0,
        lossByReason,
      },
      agenda: {
        total: apptTotal, attended: apptAttended, byStatus: apptStatus,
        attendanceRate: apptAttended + noShow > 0 ? Math.round((apptAttended / (apptAttended + noShow)) * 100) : 0,
      },
      followup: { created: fuCreated, completed: fuCompleted },
    });
  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
