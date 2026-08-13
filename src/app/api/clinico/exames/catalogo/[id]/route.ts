import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// DELETE /api/clinico/exames/catalogo/[id] — tira um exame do painel da clínica.
//
// Soft delete: pedidos e modelos já criados NÃO mudam, porque guardam o nome do
// exame como snapshot e não uma referência a esta linha.

export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'edit');
    if (denied) return denied;

    // O filtro por companyId é o que impede uma clínica mexer no painel da outra.
    const item = await prisma.examCatalogItem.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ error: 'Exame não encontrado' }, { status: 404 });

    await prisma.examCatalogItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover exame do painel:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
