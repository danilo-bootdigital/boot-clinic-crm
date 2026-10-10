import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { LocationSchema } from '@/lib/validations/stock';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';
import { applyLocationRules } from '@/lib/stock/locations';

type Ctx = { params: { id: string } };

// PATCH /api/estoque/locations/:id
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = LocationSchema.partial().safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const companyId = dbUser!.companyId;
    const [before, after] = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockLocation.findFirst({ where: { id: params.id, companyId } });
      if (!b) throw new StockError(404, 'Local não encontrado');
      const data = { ...parsed.data };
      // Deixar de ser guarda de controlados com controlado dentro deixaria o item em local proibido.
      if (data.controlledStorage === false && b.controlledStorage) {
        const ctrl = await tx.stockItem.findMany({ where: { companyId, isControlled: true }, select: { id: true } });
        const held = await tx.stockBalance.count({ where: { companyId, locationId: b.id, quantity: { gt: 0 }, itemId: { in: ctrl.map((c) => c.id) } } });
        if (held > 0) throw new StockError(409, 'Há itens controlados com saldo neste local. Transfira-os antes de desmarcar a guarda de controlados.');
      }
      if (data.isActive === false) {
        const held = await tx.stockBalance.count({ where: { companyId, locationId: b.id, quantity: { gt: 0 } } });
        if (held > 0) throw new StockError(409, 'O local ainda tem saldo. Transfira os itens antes de desativar.');
      }
      await applyLocationRules(tx, companyId, { type: data.type ?? b.type, ...data }, b.id);
      if (data.type && data.type !== 'SALA') data.roomId = null;
      return [b, await tx.stockLocation.update({ where: { id: b.id }, data })];
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'STOCK_LOCATION', entityId: after.id, oldValues: before, newValues: after, request });
    return NextResponse.json(after);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'location PATCH');
  }
}

// DELETE /api/estoque/locations/:id — só local nunca movimentado (o razão o referencia).
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const removed = await withFinanceTenant(companyId, async (tx) => {
      const l = await tx.stockLocation.findFirst({ where: { id: params.id, companyId } });
      if (!l) throw new StockError(404, 'Local não encontrado');
      const used = await tx.stockMovement.count({ where: { companyId, locationId: l.id } });
      if (used > 0) throw new StockError(409, 'O local já tem movimentações no histórico. Desative em vez de excluir.');
      await tx.stockBalance.deleteMany({ where: { companyId, locationId: l.id } });
      await tx.stockLocation.delete({ where: { id: l.id } });
      return l;
    });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'STOCK_LOCATION', entityId: removed.id, oldValues: removed, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'location DELETE');
  }
}
