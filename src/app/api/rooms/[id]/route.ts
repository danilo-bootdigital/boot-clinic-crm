import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireRole, ADMIN_ROLES } from '@/lib/api/session';

// DELETE /api/rooms/[id] - soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireRole(dbUser!, ADMIN_ROLES);
    if (forbidden) return forbidden;

    const item = await prisma.room.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!item) return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });

    await prisma.room.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir sala:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
