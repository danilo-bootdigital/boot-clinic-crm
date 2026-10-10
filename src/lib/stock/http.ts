import { NextResponse } from 'next/server';
import { withFinanceTenant, type TxClient } from '@/lib/db/financeTenant';
import { InsufficientBalanceError, StockError, type Actor } from '@/lib/stock/movements';
import { reportRejectedExit } from '@/lib/stock/alerts';
import { FinancialError } from '@/lib/api/financial-service';

const num = (d: unknown) => (d == null ? 0 : Number(String(d)));

// Converte erros do domínio em resposta HTTP. Saldo insuficiente: emite o
// alerta (§5.3) e devolve as saídas possíveis — outros lotes/locais com saldo.
export async function stockErrorResponse(err: unknown, actor: Actor | undefined, request: Request, label: string) {
  if (err instanceof InsufficientBalanceError && actor) {
    await reportRejectedExit(actor, err.info, request);
    const alternatives = await withFinanceTenant(actor.companyId, async (tx) => {
      const rows = await tx.stockBalance.findMany({
        where: { companyId: actor.companyId, itemId: err.info.itemId, quantity: { gt: 0 } },
        orderBy: { quantity: 'desc' },
        take: 10,
      });
      const [lots, locs] = await Promise.all([
        tx.stockLot.findMany({ where: { id: { in: rows.map((r) => r.lotId) } } }),
        tx.stockLocation.findMany({ where: { id: { in: rows.map((r) => r.locationId) } } }),
      ]);
      const lotBy = new Map(lots.map((l) => [l.id, l]));
      const locBy = new Map(locs.map((l) => [l.id, l]));
      return rows.map((r) => ({
        locationId: r.locationId,
        locationName: locBy.get(r.locationId)?.name ?? '—',
        lotId: r.lotId,
        lotNumber: lotBy.get(r.lotId)?.lotNumber ?? '—',
        expiresAt: lotBy.get(r.lotId)?.expiresAt?.toISOString() ?? null,
        lotStatus: lotBy.get(r.lotId)?.status ?? null,
        quantity: num(r.quantity),
      }));
    }).catch(() => []);
    return NextResponse.json({ error: err.message, code: 'NO_BALANCE', ...err.info, alternatives }, { status: 409 });
  }
  if (err instanceof FinancialError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof StockError) {
    return NextResponse.json({ error: err.message, ...(err.details ?? {}) }, { status: err.status });
  }
  if ((err as any)?.code === 'P2002') {
    return NextResponse.json({ error: 'Já existe um cadastro com esse nome' }, { status: 409 });
  }
  console.error(`[estoque] ${label}:`, err);
  return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
}

// Cadastros iniciais da clínica no primeiro acesso (idempotente): categorias
// sugeridas + o local padrão de entradas. Mesmo padrão de auto-seed de
// categorias financeiras.
const DEFAULT_CATEGORIES = ['Injetáveis', 'Medicamentos', 'Descartáveis', 'Cosméticos', 'Limpeza e escritório'];

export async function ensureStockDefaults(tx: TxClient, companyId: string) {
  const [cats, locs] = await Promise.all([
    tx.stockCategory.count({ where: { companyId } }),
    tx.stockLocation.count({ where: { companyId } }),
  ]);
  if (cats === 0) {
    await tx.stockCategory.createMany({
      data: DEFAULT_CATEGORIES.map((name, order) => ({ companyId, name, order, isDefault: true })),
      skipDuplicates: true,
    });
  }
  if (locs === 0) {
    await tx.stockLocation.createMany({
      data: [{ companyId, name: 'Almoxarifado', type: 'ALMOXARIFADO', isDefault: true }],
      skipDuplicates: true,
    });
  }
}
