import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { resolveStockUser, stockCan, stockJson, type StockCapability } from '@/lib/api/stock-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { prisma } from '@/lib/db/prisma';
import { writeAudit } from '@/lib/api/audit';
import { MovementSchema } from '@/lib/validations/stock';
import { postMovement } from '@/lib/stock/movements';
import { stockErrorResponse } from '@/lib/stock/http';

const num = (d: unknown) => (d == null ? 0 : Number(String(d)));

// Capacidade exigida por operação (§7).
const OP_CAP: Record<string, StockCapability> = {
  ENTRADA: 'receive',
  CONSUMO: 'consume',
  PERDA: 'adjust',
  AJUSTE: 'adjust',
  TRANSFERENCIA: 'transfer',
};

// GET /api/estoque/movements — razão (kardex). Filtros: ?itemId= &locationId=
// &type= &patientId= &from= &to= &before=<ISO> &limit=. Com itemId (e sem
// filtro de tipo/paciente), cada linha traz o saldo após o movimento.
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('view');
  if (error) return error;
  try {
    const sp = request.nextUrl.searchParams;
    const companyId = dbUser!.companyId;
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 500);
    const itemId = sp.get('itemId') || undefined;
    const locationId = sp.get('locationId') || undefined;
    const type = sp.get('type') || undefined;
    const patientId = sp.get('patientId') || undefined;
    const occurredAt: Prisma.DateTimeFilter = {};
    if (sp.get('from')) occurredAt.gte = new Date(sp.get('from')!);
    if (sp.get('to')) occurredAt.lte = new Date(sp.get('to')!);
    if (sp.get('before')) occurredAt.lt = new Date(sp.get('before')!);

    const data = await withFinanceTenant(companyId, async (tx) => {
      const scope = { companyId, ...(itemId ? { itemId } : {}), ...(locationId ? { locationId } : {}) };
      const rows = await tx.stockMovement.findMany({
        where: {
          ...scope,
          ...(type ? { type: type as any } : {}),
          ...(patientId ? { patientId } : {}),
          ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });

      let running: number | null = null;
      if (itemId && !type && !patientId && rows.length > 0) {
        const agg = await tx.stockMovement.aggregate({ where: { ...scope, occurredAt: { lte: rows[0].occurredAt } }, _sum: { quantity: true } });
        running = num(agg._sum.quantity);
      }
      const users = await prisma.user.findMany({
        where: { companyId, id: { in: Array.from(new Set(rows.map((r) => r.createdById))) } },
        select: { id: true, name: true },
      });
      const userBy = new Map(users.map((u) => [u.id, u.name]));

      return {
        movements: rows.map((r) => {
          const balanceAfter = running;
          if (running !== null) running -= num(r.quantity);
          return { ...r, createdByName: userBy.get(r.createdById) ?? '—', balanceAfter };
        }),
        hasMore: rows.length === limit,
      };
    });
    return NextResponse.json(stockJson(data, stockCan(dbUser!.role, 'view_cost')));
  } catch (err) {
    return stockErrorResponse(err, dbUser!, request, 'movements GET');
  }
}

// POST /api/estoque/movements — entrada avulsa, consumo interno, perda, ajuste
// ou transferência. Saída sem saldo é recusada (409) e emite alerta (§5.3).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = MovementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const { dbUser, error } = await resolveStockUser(OP_CAP[parsed.data.operation]);
  if (error) return error;
  const actor = { id: dbUser!.id, name: dbUser!.name, companyId: dbUser!.companyId, role: dbUser!.role };
  try {
    const created = await withFinanceTenant(actor.companyId, (tx) => postMovement(tx, actor, parsed.data));
    if (parsed.data.operation === 'AJUSTE' || parsed.data.operation === 'PERDA') {
      for (const m of created) {
        await writeAudit({ dbUser: actor, action: 'CREATE', entityType: 'STOCK_MOVEMENT', entityId: m.id, newValues: m, request });
      }
    }
    return NextResponse.json(stockJson(created, stockCan(actor.role, 'view_cost')), { status: 201 });
  } catch (err) {
    return stockErrorResponse(err, actor, request, 'movements POST');
  }
}
