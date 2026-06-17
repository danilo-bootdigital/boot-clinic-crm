import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// GET /api/dashboard/kpis - KPIs reais da empresa (Pacientes + CRM + Agenda)
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'dashboard', 'view');
    if (denied) return denied;
    const companyId = dbUser!.companyId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - todayStart.getDay());
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const last7 = new Date(todayStart); last7.setDate(last7.getDate() - 7);

    const apptOpen = { notIn: ['CANCELED', 'NO_SHOW'] as any };

    const [
      patientsActive, patientsTotal, patientsNew, patientsPrev,
      dealsOpen, dealsOpenValue, dealsWon, dealsWonValue, dealsLost,
      apptToday, apptWeek, apptMonth, apptAttended, apptPrevMonth,
      apptByStatus, patientsByOrigin, apptTodayByStatus, noShow7d,
      fuPendingToday, fuOverdue, fuThisWeek, fuCompletedMonth, fuTotalMonth,
    ] = await Promise.all([
      prisma.patient.count({ where: { companyId, deletedAt: null, status: 'ACTIVE' } }),
      prisma.patient.count({ where: { companyId, deletedAt: null } }),
      prisma.patient.count({ where: { companyId, deletedAt: null, createdAt: { gte: monthStart } } }),
      prisma.patient.count({ where: { companyId, deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, status: { notIn: ['WON', 'LOST'] } } }),
      prisma.deal.aggregate({ _sum: { valueEstimated: true }, where: { companyId, deletedAt: null, status: { notIn: ['WON', 'LOST'] } } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, status: 'WON', wonAt: { gte: monthStart } } }),
      prisma.deal.aggregate({ _sum: { valueEstimated: true }, where: { companyId, deletedAt: null, status: 'WON', wonAt: { gte: monthStart } } }),
      prisma.deal.count({ where: { companyId, deletedAt: null, status: 'LOST', lostAt: { gte: monthStart } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: apptOpen, startAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: apptOpen, startAt: { gte: weekStart, lt: weekEnd } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: apptOpen, startAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: 'ATTENDED', startAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: 'ATTENDED', startAt: { gte: prevMonthStart, lt: monthStart } } }),
      prisma.appointment.groupBy({ by: ['status'], _count: true, where: { companyId, deletedAt: null, startAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.patient.groupBy({ by: ['origin'], _count: true, where: { companyId, deletedAt: null } }),
      prisma.appointment.groupBy({ by: ['status'], _count: true, where: { companyId, deletedAt: null, startAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.appointment.count({ where: { companyId, deletedAt: null, status: 'NO_SHOW', startAt: { gte: last7 } } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { gte: todayStart, lt: todayEnd } } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { gte: weekStart, lt: weekEnd } } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, status: 'COMPLETED', completedAt: { gte: monthStart } } }),
      prisma.followUpTask.count({ where: { companyId, deletedAt: null, createdAt: { gte: monthStart } } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of apptByStatus) byStatus[row.status] = (row as any)._count;
    const todayByStatus: Record<string, number> = {};
    for (const row of apptTodayByStatus) todayByStatus[row.status] = (row as any)._count;
    const byOrigin: Record<string, number> = {};
    for (const row of patientsByOrigin) byOrigin[row.origin] = (row as any)._count;

    return NextResponse.json({
      patients: { active: patientsActive, total: patientsTotal, newThisMonth: patientsNew, newPrevMonth: patientsPrev, byOrigin },
      deals: {
        open: dealsOpen,
        openValue: dealsOpenValue._sum.valueEstimated ?? 0,
        wonThisMonth: dealsWon,
        wonValueThisMonth: dealsWonValue._sum.valueEstimated ?? 0,
        lostThisMonth: dealsLost,
      },
      appointments: {
        today: apptToday, thisWeek: apptWeek, thisMonth: apptMonth,
        attendedThisMonth: apptAttended, attendedPrevMonth: apptPrevMonth,
        byStatus, todayByStatus, noShow7d,
      },
      followup: {
        pendingToday: fuPendingToday,
        overdue: fuOverdue,
        thisWeek: fuThisWeek,
        completedThisMonth: fuCompletedMonth,
        totalThisMonth: fuTotalMonth,
        completionRate: fuTotalMonth > 0 ? Math.round((fuCompletedMonth / fuTotalMonth) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('Erro ao calcular KPIs:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
