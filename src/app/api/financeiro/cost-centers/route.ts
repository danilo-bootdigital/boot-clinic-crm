import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { ensureExpenseCatalog } from '@/lib/api/payable-service';
import { writeAudit } from '@/lib/api/audit';
import { CreateNamedCatalogSchema } from '@/lib/validations/financial';

// GET /api/financeiro/cost-centers — centros de custo (auto-seed).
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const rows = await withFinanceTenant(dbUser!.companyId, async (tx) => {
      await ensureExpenseCatalog(tx, dbUser!.companyId);
      return tx.costCenter.findMany({ where: { companyId: dbUser!.companyId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar centros de custo:', err);
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
      tx.costCenter.create({ data: { companyId: dbUser!.companyId, ...parsed.data } }),
    );
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'COST_CENTER', entityId: created.id, newValues: created, request });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe centro de custo com esse nome' }, { status: 409 });
    console.error('Erro ao criar centro de custo:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
