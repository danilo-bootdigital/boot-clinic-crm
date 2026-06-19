import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// GET /api/dashboard/trends — série temporal dos últimos 6 meses (evolução).
// Usado pelos gráficos de linha/área dos dashboards.
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'dashboard', 'view');
    if (denied) return denied;
    const companyId = dbUser!.companyId;

    const now = new Date();
    const MONTHS = 6;
    const ranges = Array.from({ length: MONTHS }, (_, idx) => {
      const i = MONTHS - 1 - idx; // do mais antigo ao mais recente
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      return { month: `${start.getFullYear()}-${mm}`, start, end };
    });

    const series = await Promise.all(
      ranges.map(async ({ month, start, end }) => {
        const [newPatients, wonAgg, attended] = await Promise.all([
          prisma.patient.count({ where: { companyId, deletedAt: null, createdAt: { gte: start, lt: end } } }),
          prisma.deal.aggregate({
            _sum: { valueEstimated: true },
            where: { companyId, deletedAt: null, status: 'WON', wonAt: { gte: start, lt: end } },
          }),
          prisma.appointment.count({
            where: { companyId, deletedAt: null, status: 'ATTENDED', startAt: { gte: start, lt: end } },
          }),
        ]);
        return {
          month,
          newPatients,
          wonValue: wonAgg._sum.valueEstimated ?? 0,
          attended,
        };
      }),
    );

    return NextResponse.json({ series });
  } catch (err) {
    console.error('Erro ao calcular tendências:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
