import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';
import { stockCan, stockModuleLevel, type StockCapability } from '@/lib/stock-caps';

// RBAC do Módulo Estoque — a regra (por CAPACIDADE) vive em lib/stock-caps
// (pura/client-safe). Aqui ficam só os wrappers de servidor (auth + escopo + 403).
export { stockCan, stockModuleLevel };
export type { StockCapability };

// Resolve usuário + bloqueio de assinatura + módulo 'estoque' + capacidade.
// Drop-in nas rotas: `const { dbUser, error } = await resolveStockUser('view')`.
export async function resolveStockUser(cap: StockCapability) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: { select: { status: true, plan: true } } },
  });
  if (!dbUser) return { error: NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 }) };

  const blocked = await subscriptionBlock(dbUser);
  if (blocked) return { error: blocked };

  const moduleOff = await requireModuleEnabled(dbUser, 'estoque');
  if (moduleOff) return { error: moduleOff };

  if (!stockCan(dbUser.role, cap)) {
    return { error: NextResponse.json({ error: 'Sem permissão para esta ação de estoque' }, { status: 403 }) };
  }

  return { dbUser };
}

// Campos de VALOR. Para quem não tem `view_cost` (ex.: médico), saem do JSON no
// servidor — não basta esconder na tela (decisão Danilo, 2026-10-08, §7).
const COST_KEYS = new Set([
  'avgCost', 'lastCost', 'unitCost', 'totalCost', 'salePrice', 'totalValue', 'stockValue',
]);

// Serializa para JSON: Decimal → number, Date → ISO, e remove custo se não puder vê-lo.
export function stockJson<T>(data: T, canViewCost: boolean): any {
  const walk = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (Prisma.Decimal.isDecimal(v)) return Number(v.toString());
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (!canViewCost && COST_KEYS.has(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(data);
}
