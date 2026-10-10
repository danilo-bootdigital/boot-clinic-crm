import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveStockUser } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { reverseUsageLine, type RunTx } from '@/lib/stock/appointments';
import { stockErrorResponse } from '@/lib/stock/http';

const Schema = z.object({ movementId: z.string().min(1), reason: z.string().trim().min(3, 'Motivo é obrigatório').max(500) });

// POST /api/estoque/appointments/:id/usage/reverse — corrige uma linha do painel
// (médico nos próprios atendimentos, recepção em qualquer; controlado só gestão).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { dbUser, error } = await resolveStockUser('consume');
  if (error) return error;
  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  const runTx: RunTx = (fn) => withFinanceTenant(actor.companyId, fn);
  try {
    const created = await reverseUsageLine(runTx, actor, params.id, parsed.data.movementId, parsed.data.reason);
    await writeAudit({ dbUser: actor, action: 'REVERSE', entityType: 'STOCK_MOVEMENT', entityId: parsed.data.movementId, newValues: { appointmentId: params.id, reason: parsed.data.reason, reversals: created.map((c) => c.id) }, request });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'usage reverse');
  }
}
