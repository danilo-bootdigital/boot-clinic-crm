import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/patients/:id/applied — produtos aplicados no paciente
// (lote, validade, data, profissional). Estornados ficam de fora.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const rows = await withFinanceTenant(companyId, (tx) => tx.stockMovement.findMany({
      where: { companyId, patientId: params.id, type: { in: ['CONSUMO_ATENDIMENTO', 'CONSUMO_INTERNO'] }, reversedAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 300,
    }));
    return NextResponse.json(stockJson(rows, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'patient applied');
  }
}
