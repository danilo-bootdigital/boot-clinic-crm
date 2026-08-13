import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { z } from 'zod';

// GET  /api/clinico/exames/catalogo — painel de exames DESTA clínica
// POST /api/clinico/exames/catalogo — adiciona um exame ao painel
//
// MULTIEMPRESA: o painel é exclusivo da clínica. NÃO existe semeadura
// automática — a versão anterior copiava o painel de uma clínica para toda
// clínica que abrisse o módulo, o que espalhava a lista curada de uma para
// todas. Cada clínica monta o seu, e quem não tem painel emite pelo campo de
// digitação livre.

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  name: z.string().trim().min(1, 'Nome do exame é obrigatório').max(180),
  group: z.string().trim().min(1, 'Grupo é obrigatório').max(120),
  subgroup: z.string().trim().max(120).optional().or(z.literal('')),
});

export async function GET(_request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'view');
    if (denied) return denied;

    const companyId = dbUser!.companyId;

    const itens = await prisma.examCatalogItem.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      orderBy: [{ order: 'asc' }],
      select: { id: true, group: true, subgroup: true, name: true },
    });

    // Agrupa preservando a ordem de inserção (group → subgroup → itens).
    const grupos: { group: string; subgroups: { subgroup: string | null; items: typeof itens }[] }[] = [];
    for (const item of itens) {
      let g = grupos.find((x) => x.group === item.group);
      if (!g) {
        g = { group: item.group, subgroups: [] };
        grupos.push(g);
      }
      let sg = g.subgroups.find((x) => x.subgroup === (item.subgroup ?? null));
      if (!sg) {
        sg = { subgroup: item.subgroup ?? null, items: [] };
        g.subgroups.push(sg);
      }
      sg.items.push(item);
    }

    return NextResponse.json({
      grupos,
      // A tela usa isto para explicar o painel vazio em vez de parecer quebrada.
      vazio: itens.length === 0,
    });
  } catch (err) {
    console.error('Erro ao carregar catálogo de exames:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'edit');
    if (denied) return denied;

    const d = CreateSchema.parse(await request.json());
    const companyId = dbUser!.companyId;

    const duplicado = await prisma.examCatalogItem.findFirst({
      where: { companyId, deletedAt: null, name: d.name, group: d.group },
      select: { id: true },
    });
    if (duplicado) {
      return NextResponse.json({ error: 'Esse exame já está no painel' }, { status: 409 });
    }

    // Entra no fim do grupo, preservando a ordem que a clínica montou.
    const ultimo = await prisma.examCatalogItem.findFirst({
      where: { companyId, deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const item = await prisma.examCatalogItem.create({
      data: {
        companyId,
        name: d.name,
        group: d.group,
        subgroup: d.subgroup || null,
        order: (ultimo?.order ?? -1) + 1,
      },
      select: { id: true, name: true, group: true, subgroup: true },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao adicionar exame ao painel:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
