import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser, stockCan, stockJson } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { UsageConfirmSchema } from '@/lib/validations/stock';
import { confirmUsage, getUsagePanel, type RunTx } from '@/lib/stock/appointments';
import { reportRejectedExit } from '@/lib/stock/alerts';
import { stockErrorResponse } from '@/lib/stock/http';

type Ctx = { params: { id: string } };

// GET /api/estoque/appointments/:id/usage[?kitIds=a,b] — painel "Materiais utilizados".
export async function GET(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const kitParam = request.nextUrl.searchParams.get('kitIds');
    const kitIds = kitParam === null ? undefined : kitParam.split(',').filter(Boolean);
    const panel = await withFinanceTenant(actor.companyId, (tx) => getUsagePanel(tx, actor, params.id, kitIds));
    return NextResponse.json(stockJson(panel, stockCan(actor.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'usage GET');
  }
}

// POST /api/estoque/appointments/:id/usage — confere (ou acrescenta) materiais.
// Linha sem saldo não desfaz as outras: volta como falha + alerta (§5.3/§5.14).
export async function POST(request: NextRequest, { params }: Ctx) {
  const { dbUser, error } = await resolveStockUser('consume');
  if (error) return error;
  const parsed = UsageConfirmSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  const runTx: RunTx = (fn) => withFinanceTenant(actor.companyId, fn, { timeout: 30_000 });
  try {
    const results = await confirmUsage(runTx, actor, params.id, parsed.data);
    for (const r of results) if (!r.ok && r.rejected) await reportRejectedExit(actor, r.rejected, request);
    await writeAudit({
      dbUser: actor, action: 'UPDATE', entityType: 'APPOINTMENT', entityId: params.id,
      newValues: { stockUsage: parsed.data.add ? 'add' : 'confirm', lines: results }, request,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'usage POST');
  }
}
