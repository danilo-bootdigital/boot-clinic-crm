import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { SettingsSchema } from '@/lib/validations/stock';
import { ensureStockDefaults, stockErrorResponse } from '@/lib/stock/http';

// GET /api/estoque/settings — configuração do módulo (criada no 1º acesso).
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const settings = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      await ensureStockDefaults(tx, dbUser!.companyId);
      return tx.stockSettings.upsert({
        where: { companyId: dbUser!.companyId },
        update: {},
        create: { companyId: dbUser!.companyId },
      });
    });
    return NextResponse.json(settings);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'settings GET');
  }
}

// PATCH /api/estoque/settings — modo padrão de baixa, antecedência dos alertas.
export async function PATCH(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('manage');
  if (error) return error;
  const parsed = SettingsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const companyId = dbUser!.companyId;
    const [before, after] = await withFinanceTenant(companyId, async (tx) => {
      const b = await tx.stockSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
      const a = await tx.stockSettings.update({ where: { companyId }, data: parsed.data });
      return [b, a];
    });
    await writeAudit({ dbUser: dbUser!, action: 'UPDATE', entityType: 'STOCK_SETTINGS', entityId: after.id, oldValues: before, newValues: after, request });
    return NextResponse.json(after);
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'settings PATCH');
  }
}
