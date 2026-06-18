import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { ensureExpenseCatalog } from '@/lib/api/payable-service';
import { writeAudit } from '@/lib/api/audit';
import { CreateNamedCatalogSchema } from '@/lib/validations/financial';

// GET /api/financeiro/expense-categories — categorias de despesa (auto-seed).
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const rows = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      await ensureExpenseCatalog(tx, dbUser!.companyId);
      return tx.expenseCategory.findMany({ where: { companyId: dbUser!.companyId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar categorias de despesa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = CreateNamedCatalogSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.expenseCategory.create({ data: { companyId: dbUser!.companyId, ...parsed.data } }),
    );
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'EXPENSE_CATEGORY', entityId: created.id, newValues: created, request });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe categoria com esse nome' }, { status: 409 });
    console.error('Erro ao criar categoria de despesa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
