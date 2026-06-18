import { NextRequest, NextResponse } from 'next/server';
import { resolvePayableUser } from '@/lib/api/payable-access';
import { withFinanceTenant } from '@/lib/db/financeTenant';
import { writeAudit } from '@/lib/api/audit';
import { CreateSupplierSchema } from '@/lib/validations/financial';

// GET /api/financeiro/suppliers — fornecedores da clínica.
export async function GET() {
  try {
    const { dbUser, error } = await resolvePayableUser('view');
    if (error) return error;
    const rows = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.supplier.findMany({ where: { companyId: dbUser!.companyId, deletedAt: null }, orderBy: { name: 'asc' }, take: 500 }),
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/financeiro/suppliers — cria fornecedor.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolvePayableUser('create');
    if (error) return error;
    const parsed = CreateSupplierSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
    const { email, ...rest } = parsed.data;
    const created = await withFinanceTenant(dbUser!.companyId, (tx) =>
      tx.supplier.create({ data: { companyId: dbUser!.companyId, ...rest, email: email || null } }),
    );
    await writeAudit({ dbUser: dbUser!, action: 'CREATE', entityType: 'SUPPLIER', entityId: created.id, newValues: created, request });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Já existe fornecedor com esse nome' }, { status: 409 });
    console.error('Erro ao criar fornecedor:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
