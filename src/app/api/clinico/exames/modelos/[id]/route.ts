import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// DELETE /api/clinico/exames/modelos/[id] — remove um modelo (soft delete).
// Pedidos já emitidos a partir dele NÃO são afetados: eles guardam o próprio
// snapshot dos exames.

export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'edit');
    if (denied) return denied;

    const modelo = await prisma.examTemplate.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!modelo) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

    await prisma.examTemplate.update({ where: { id: modelo.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover modelo de pedido:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
