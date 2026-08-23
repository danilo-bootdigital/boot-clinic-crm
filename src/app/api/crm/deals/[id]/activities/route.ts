import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/server';
import { requirePermission } from '@/lib/api/permissions';
import { subscriptionBlock } from '@/lib/api/session';
import { requireModuleEnabled } from '@/lib/api/modules';

// Histórico do negócio: mudança de etapa, perda com motivo, conversão pela
// conversa. Já era gravado (DealActivity) e ninguém lia — é o que responde
// "quem mexeu nisso, quando e por quê" sem abrir o banco.

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    const blocked = await subscriptionBlock(dbUser);
    if (blocked) return blocked;
    const moduleOff = await requireModuleEnabled(dbUser, 'crm');
    if (moduleOff) return moduleOff;
    const denied = requirePermission(dbUser, 'crm', 'view');
    if (denied) return denied;

    // Escopo por empresa antes de qualquer leitura: id de deal vem do cliente.
    const deal = await prisma.deal.findFirst({
      where: { id: params.id, companyId: dbUser.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!deal) return NextResponse.json({ error: 'Deal não encontrado' }, { status: 404 });

    const activities = await prisma.dealActivity.findMany({
      where: { dealId: deal.id, companyId: dbUser.companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const authorIds = Array.from(new Set(activities.map((a) => a.authorId)));
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a.name]));

    return NextResponse.json(
      activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        description: a.description,
        createdAt: a.createdAt,
        authorName: authorMap.get(a.authorId) ?? null,
      }))
    );
  } catch (err) {
    console.error('Erro ao listar histórico do deal:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
