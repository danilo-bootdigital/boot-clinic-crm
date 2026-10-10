import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { KitSchema } from '@/lib/validations/stock';
import { saveKit } from '@/lib/stock/kits';
import { StockError } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

type Ctx = { params: { id: string } };

// PATCH /api/estoque/kits/:id — substitui a ficha (cabeçalho + itens).
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = KitSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  try {
    const companyId = dbUser!.companyId;
    const kit = await withFinanceTenant(companyId, async (tx) => {
      const cur = await tx.procedureKit.findFirst({ where: { id: params.id, companyId } });
      if (!cur) throw new StockError(404, 'Ficha técnica não encontrada');
      return saveKit(tx, companyId, cur.id, parsed.data);
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'PROCEDURE_KIT', entityId: kit.id, newValues: parsed.data, request });
    return NextResponse.json(stockJson(kit, true));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'kit PATCH');
  }
}

// DELETE /api/estoque/kits/:id — as baixas já feitas ficam no razão (snapshot).
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const removed = await withFinanceTenant(companyId, async (tx) => {
      const cur = await tx.procedureKit.findFirst({ where: { id: params.id, companyId } });
      if (!cur) throw new StockError(404, 'Ficha técnica não encontrada');
      await tx.procedureKit.delete({ where: { id: cur.id } });
      return cur;
    });
    await writeAudit({ dbUser: dbUser!, action: 'DELETE', entityType: 'PROCEDURE_KIT', entityId: removed.id, oldValues: { name: removed.name }, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'kit DELETE');
  }
}
