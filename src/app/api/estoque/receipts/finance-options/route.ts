import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { payableCan } from '@/lib/financial-caps';
import { ensureExpenseCatalog } from '@/lib/api/payable-service';
import { MATERIAL_CATEGORY } from '@/lib/stock/receipts';
import { stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/receipts/finance-options — se o usuário pode gerar a conta
// a pagar e, se puder, as categorias de despesa e os centros de custo.
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('receive');
  if (error) return error;
  const canCreatePayable = payableCan(dbUser!.role, 'create');
  if (!canCreatePayable) return NextResponse.json({ canCreatePayable, categories: [], costCenters: [], defaultCategoryName: MATERIAL_CATEGORY });
  try {
    const companyId = dbUser!.companyId;
    const data = await withFinanceTenant(companyId, async (tx) => {
      await ensureExpenseCatalog(tx, companyId);
      const [categories, costCenters] = await Promise.all([
        tx.expenseCategory.findMany({ where: { companyId, isActive: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
        tx.costCenter.findMany({ where: { companyId, isActive: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
      ]);
      return { categories, costCenters };
    });
    return NextResponse.json({ canCreatePayable, ...data, defaultCategoryName: MATERIAL_CATEGORY });
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'finance-options');
  }
}
