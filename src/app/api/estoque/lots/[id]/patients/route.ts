import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/lots/:id/patients — rastreabilidade lote → pacientes
// (recall/tecnovigilância). Só aplicações não estornadas.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const data = await withFinanceTenant(companyId, async (tx) => {
      const lot = await tx.stockLot.findFirst({ where: { id: params.id, companyId } });
      if (!lot) throw new StockError(404, 'Lote não encontrado');
      const mvs = await tx.stockMovement.findMany({
        where: { companyId, lotId: lot.id, patientId: { not: null }, reversedAt: null, type: { in: ['CONSUMO_ATENDIMENTO', 'CONSUMO_INTERNO', 'VENDA'] } },
        orderBy: { occurredAt: 'desc' },
        select: { id: true, occurredAt: true, quantity: true, patientId: true, appointmentId: true, snapshot: true },
      });
      return {
        lot: { id: lot.id, lotNumber: lot.lotNumber, expiresAt: lot.expiresAt, status: lot.status },
        applications: mvs.map((m) => {
          const s = (m.snapshot ?? {}) as Record<string, any>;
          return {
            id: m.id, occurredAt: m.occurredAt, quantity: Math.abs(Number(m.quantity)), baseUnit: s.baseUnit ?? '',
            patientId: m.patientId, patientName: s.patientName ?? null, professionalName: s.professionalName ?? null,
            appointmentId: m.appointmentId, region: s.region ?? null,
          };
        }),
      };
    });
    return NextResponse.json(data);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'lot patients');
  }
}
