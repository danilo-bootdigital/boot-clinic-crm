import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveTelemedicineUser } from '@/lib/api/telemedicine';

// GET /api/telemedicine/dashboard?from=&to= — indicadores de teleconsultas.
// realizadas, canceladas, faltas, duração média, comparecimento, conversão,
// atendimentos por profissional, ocupação da agenda remota.
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveTelemedicineUser('view');
    if (error) return error;
    const companyId = dbUser!.companyId;

    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const from = sp.get('from') ? new Date(`${sp.get('from')}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59`) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const where = { companyId, deletedAt: null, scheduledAt: { gte: from, lte: to } };
    const sessions = await prisma.telemedicineSession.findMany({
      where, select: { status: true, durationSeconds: true, professionalId: true, patientJoinedAt: true },
    });

    const total = sessions.length;
    const by = (s: string) => sessions.filter((x) => x.status === s).length;
    const finalizadas = by('FINALIZADA');
    const canceladas = by('CANCELADA');
    const faltas = by('NAO_COMPARECEU');
    const agendadas = total - finalizadas - canceladas - faltas;

    const durations = sessions.filter((s) => s.durationSeconds && s.durationSeconds > 0).map((s) => s.durationSeconds!);
    const avgDurationMin = durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) / 60) : 0;

    // Comparecimento = finalizadas / (finalizadas + faltas).
    const attendanceBase = finalizadas + faltas;
    const attendanceRate = attendanceBase ? Math.round((finalizadas / attendanceBase) * 100) : 0;
    // Conversão (proxy operacional) = realizadas / agendadas no período.
    const conversionRate = total ? Math.round((finalizadas / total) * 100) : 0;

    // Atendimentos por profissional.
    const profCount = new Map<string, number>();
    for (const s of sessions) profCount.set(s.professionalId, (profCount.get(s.professionalId) || 0) + 1);
    const profIds = Array.from(profCount.keys());
    const profs = profIds.length ? await prisma.professional.findMany({ where: { id: { in: profIds } }, select: { id: true, name: true } }) : [];
    const pm = new Map(profs.map((p) => [p.id, p.name]));
    const byProfessional = Array.from(profCount.entries())
      .map(([id, count]) => ({ professionalId: id, name: pm.get(id) || '—', count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      period: { from, to },
      totals: { total, finalizadas, canceladas, faltas, agendadas },
      avgDurationMin,
      attendanceRate,
      conversionRate,
      byProfessional,
    });
  } catch (err) {
    console.error('Erro no dashboard de telemedicina:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
