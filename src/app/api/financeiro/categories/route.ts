import { NextRequest, NextResponse } from 'next/server';
import { resolveFinanceUser } from '@/lib/api/financial-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { ensureRevenueCategories } from '@/lib/api/financial-service';
import { writeAudit } from '@/lib/api/audit';
import { CreateRevenueCategorySchema } from '@/lib/validations/financial';

// GET /api/financeiro/categories — categorias de receita (auto-seed dos defaults).
export async function GET() {
  try {
    const { dbUser, error } = await resolveFinanceUser('view');
    if (error) return error;
    const rows = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      await ensureRevenueCategories(tx, dbUser!.companyId);
      return tx.revenueCategory.findMany({
        where: { companyId: dbUser!.companyId },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      });
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar categorias de receita:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/financeiro/categories — cria categoria customizada.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveFinanceUser('create');
    if (error) return error;
    const parsed = CreateRevenueCategorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.revenueCategory.create({ data: { companyId: dbUser!.companyId, ...parsed.data } }),
    );
    await writeAudit({
      dbUser: dbUser!,
      action: 'CREATE',
      entityType: 'REVENUE_CATEGORY',
      entityId: created.id,
      newValues: created,
      request,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe uma categoria com esse nome' }, { status: 409 });
    }
    console.error('Erro ao criar categoria de receita:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
