import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { ensureStockDefaults, stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/lookups — listas dos formulários do estoque num único
// round-trip (categorias, locais, salas, fornecedores, profissionais). Só
// id/nome: a recepção precisa do fornecedor no item sem ter acesso a Contas a Pagar.
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const companyId = dbUser!.companyId;
    const data = await withFinanceTenant(companyId, async (tx) => {
      await ensureStockDefaults(tx, companyId);
      const [categories, locations, rooms, suppliers, professionals] = await Promise.all([
        tx.stockCategory.findMany({ where: { companyId, isActive: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
        tx.stockLocation.findMany({
          where: { companyId, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          select: { id: true, name: true, type: true, storageTemp: true, isDefault: true, controlledStorage: true },
        }),
        tx.room.findMany({ where: { companyId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.supplier.findMany({ where: { companyId, deletedAt: null, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.professional.findMany({ where: { companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ]);
      return { categories, locations, rooms, suppliers, professionals };
    });
    return NextResponse.json(data);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'lookups GET');
  }
}
