import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';

// GET    — painel completo (para conferir antes de aplicar)
// DELETE — remove da biblioteca (soft). Clínicas que já receberam NÃO são
//          afetadas: elas têm cópias próprias.

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const painel = await prisma.examPanelPreset.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!painel) return NextResponse.json({ error: 'Painel não encontrado' }, { status: 404 });

    return NextResponse.json({
      id: painel.id,
      name: painel.name,
      description: painel.description,
      items: painel.items.map((i) => ({ name: i.name, group: i.group, subgroup: i.subgroup })),
    });
  } catch (err) {
    console.error('Erro ao carregar painel de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const painel = await prisma.examPanelPreset.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { id: true },
    });
    if (!painel) return NextResponse.json({ error: 'Painel não encontrado' }, { status: 404 });

    await prisma.examPanelPreset.update({ where: { id: painel.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover painel de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
