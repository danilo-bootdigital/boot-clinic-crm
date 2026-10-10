import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { prisma } from '@/lib/db/prisma';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/usages/pending — atendimentos realizados com materiais a
// conferir (modo confirmado, ou sobra/falha na automática). Médico vê só os seus.
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('consume');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const usages = await withFinanceTenant(companyId, (tx) => tx.stockAppointmentUsage.findMany({
      where: { companyId, status: 'PENDENTE' }, orderBy: { createdAt: 'desc' }, take: 200,
    }));
    let profFilter: string | undefined;
    if (dbUser!.role === 'DOCTOR') {
      const prof = await prisma.professional.findFirst({ where: { companyId, userId: dbUser!.id }, select: { id: true } });
      if (!prof) return NextResponse.json([]);
      profFilter = prof.id;
    }
    const appts = await prisma.appointment.findMany({
      where: { companyId, id: { in: usages.map((u) => u.appointmentId) }, deletedAt: null, ...(profFilter ? { professionalId: profFilter } : {}) },
      select: { id: true, type: true, startAt: true, status: true, patientId: true, professionalId: true },
    });
    const [patients, profs] = await Promise.all([
      prisma.patient.findMany({ where: { companyId, id: { in: appts.map((a) => a.patientId) } }, select: { id: true, name: true } }),
      prisma.professional.findMany({ where: { companyId, id: { in: appts.map((a) => a.professionalId) } }, select: { id: true, name: true } }),
    ]);
    const pBy = new Map(patients.map((p) => [p.id, p.name]));
    const prBy = new Map(profs.map((p) => [p.id, p.name]));
    const aBy = new Map(appts.map((a) => [a.id, a]));
    return NextResponse.json(usages.filter((u) => aBy.has(u.appointmentId)).map((u) => {
      const a = aBy.get(u.appointmentId)!;
      return { appointmentId: a.id, type: a.type, startAt: a.startAt, patientName: pBy.get(a.patientId) ?? '—', professionalName: prBy.get(a.professionalId) ?? '—', mode: u.mode };
    }));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'usages pending');
  }
}
