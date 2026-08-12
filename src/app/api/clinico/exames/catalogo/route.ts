import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import {
  EXAM_CATALOG_SEED,
  INDICACAO_CLINICA_PADRAO,
  OBSERVACOES_PADRAO,
} from '@/lib/clinical/exam-catalog-default';

// GET /api/clinico/exames/catalogo
//
// Catálogo de exames da clínica, agrupado para a tela montar o painel de
// seleção. Semeia o painel padrão no PRIMEIRO acesso — mesmo padrão do
// /api/professionals, que cria o profissional default quando não há nenhum.
// Depois disso o catálogo é da clínica: editar/desativar item não mexe na
// semente nem em pedidos já emitidos.

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'view');
    if (denied) return denied;

    const companyId = dbUser!.companyId;

    const existentes = await prisma.examCatalogItem.count({ where: { companyId, deletedAt: null } });
    if (existentes === 0) {
      await prisma.examCatalogItem.createMany({
        data: EXAM_CATALOG_SEED.map((item, i) => ({
          companyId,
          group: item.group,
          subgroup: item.subgroup ?? null,
          name: item.name,
          order: i,
        })),
      });
    }

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
      // Sugestões do modelo: a tela pré-preenche e o médico ajusta.
      sugestoes: {
        indicacaoClinica: INDICACAO_CLINICA_PADRAO,
        observacoes: OBSERVACOES_PADRAO,
      },
    });
  } catch (err) {
    console.error('Erro ao carregar catálogo de exames:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
