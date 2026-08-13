import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

// POST /api/admin/exam-panels/[id]/apply  { companyId }
//
// COPIA o painel da biblioteca para o catálogo da clínica. Cópia, não vínculo:
// a partir daqui a clínica edita o painel dela livremente, e mudanças na
// biblioteca não reescrevem o que ela já recebeu.
//
// Aplicável a qualquer momento, não só na criação da clínica — clínica que muda
// de especialidade precisa trocar de painel depois.

export const dynamic = 'force-dynamic';

const Schema = z.object({
  companyId: z.string().min(1),
  /** Substituir o painel atual em vez de somar ao que já existe. */
  replace: z.boolean().default(false),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const d = Schema.parse(await request.json());

    const [painel, company] = await Promise.all([
      prisma.examPanelPreset.findFirst({
        where: { id: params.id, deletedAt: null },
        include: { items: { orderBy: { order: 'asc' } } },
      }),
      prisma.company.findFirst({ where: { id: d.companyId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    if (!painel) return NextResponse.json({ error: 'Painel não encontrado' }, { status: 404 });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });
    if (painel.items.length === 0) {
      return NextResponse.json({ error: 'Painel sem exames' }, { status: 400 });
    }

    const atuais = await prisma.examCatalogItem.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, group: true, order: true },
    });

    if (d.replace && atuais.length > 0) {
      // Soft delete: pedidos e modelos guardam snapshot, então nada emitido
      // se perde ao trocar o painel.
      await prisma.examCatalogItem.updateMany({
        where: { id: { in: atuais.map((a) => a.id) } },
        data: { deletedAt: new Date() },
      });
    }

    // Sem replace, não duplica o que a clínica já tem com mesmo nome+grupo.
    const jaTem = new Set(
      d.replace ? [] : atuais.map((a) => `${a.group.toLowerCase()}|${a.name.toLowerCase()}`)
    );
    const novos = painel.items.filter(
      (i) => !jaTem.has(`${i.group.toLowerCase()}|${i.name.toLowerCase()}`)
    );

    let base = d.replace ? 0 : Math.max(0, ...atuais.map((a) => a.order + 1), 0);
    await prisma.examCatalogItem.createMany({
      data: novos.map((i) => ({
        companyId: company.id,
        name: i.name,
        group: i.group,
        subgroup: i.subgroup,
        order: base++,
      })),
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.COMPANY,
      entityId: company.id,
      newValues: {
        acao: 'painel_de_exames_aplicado',
        painel: painel.name,
        adicionados: novos.length,
        substituiu: d.replace,
      },
      request,
    });

    return NextResponse.json({
      ok: true,
      clinica: company.name,
      adicionados: novos.length,
      ignorados: painel.items.length - novos.length,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao aplicar painel de exame:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
