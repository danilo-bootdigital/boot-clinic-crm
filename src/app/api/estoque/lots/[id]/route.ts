import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { LotStatusSchema } from '@/lib/validations/stock';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

// PATCH /api/estoque/lots/:id — muda o status do lote (quarentena, bloqueio, recolhimento).
// Lote fora de LIBERADO não sai por consumo — só perda ou devolução (§5.6).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = LotStatusSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.status !== 'LIBERADO' && !parsed.data.blockReason?.trim()) {
    return NextResponse.json({ error: 'Informe o motivo do bloqueio' }, { status: 400 });
  }
  try {
    const companyId = dbUser!.companyId;
    const [before, after] = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockLot.findFirst({ where: { id: params.id, companyId } });
      if (!b) throw new StockError(404, 'Lote não encontrado');
      const a = await tx.stockLot.update({
        where: { id: b.id },
        data: { status: parsed.data.status, blockReason: parsed.data.status === 'LIBERADO' ? null : parsed.data.blockReason },
      });
      return [b, a];
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE_STATUS', entityType: 'STOCK_LOT', entityId: after.id, oldValues: { status: before.status }, newValues: { status: after.status, blockReason: after.blockReason }, request });
    return NextResponse.json(stockJson(after, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'lot PATCH');
  }
}
