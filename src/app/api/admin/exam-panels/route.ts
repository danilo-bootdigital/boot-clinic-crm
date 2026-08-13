import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';

// Biblioteca de painéis de exame do SAAS. Painel SUPER-ADMIN: cruza o limite de
// empresa, então só SUPER_ADMIN entra.
//
// GET  — lista os painéis da plataforma
// POST — cria um painel, do zero ou COPIANDO o catálogo de uma clínica
//
// A cópia a partir de uma clínica é ação explícita do admin, nunca automática:
// o conteúdo do painel de uma clínica é dela, e promovê-lo a base da plataforma
// é decisão de negócio (idealmente com autorização do cliente).

export const dynamic = 'force-dynamic';

const ItemSchema = z.object({
  name: z.string().trim().min(1).max(180),
  group: z.string().trim().min(1).max(120),
  subgroup: z.string().trim().max(120).optional().nullable(),
});

const CreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Nome do painel é obrigatório').max(120),
    description: z.string().trim().max(400).optional(),
    items: z.array(ItemSchema).optional(),
    /** Copiar o catálogo desta clínica para dentro do painel. */
    fromCompanyId: z.string().optional(),
  })
  .refine((d) => (d.items && d.items.length > 0) || d.fromCompanyId, {
    message: 'Informe os exames do painel ou a clínica de origem',
  });

export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const paineis = await prisma.examPanelPreset.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { items: { select: { id: true } } },
    });

    return NextResponse.json(
      paineis.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isActive: p.isActive,
        totalExames: p.items.length,
        createdAt: p.createdAt,
      }))
    );
  } catch (err) {
    console.error('Erro ao listar painéis de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());

    let items = d.items ?? [];
    if (d.fromCompanyId) {
      const origem = await prisma.examCatalogItem.findMany({
        where: { companyId: d.fromCompanyId, deletedAt: null },
        orderBy: { order: 'asc' },
        select: { name: true, group: true, subgroup: true },
      });
      if (origem.length === 0) {
        return NextResponse.json({ error: 'A clínica de origem não tem painel montado' }, { status: 400 });
      }
      items = origem;
    }

    const painel = await prisma.examPanelPreset.create({
      data: {
        name: d.name,
        description: d.description || null,
        items: {
          create: items.map((i, idx) => ({
            name: i.name,
            group: i.group,
            subgroup: i.subgroup || null,
            order: idx,
          })),
        },
      },
      select: { id: true, name: true },
    });

    return NextResponse.json(painel, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao criar painel de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
