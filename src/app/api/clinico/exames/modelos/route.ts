import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// GET  /api/clinico/exames/modelos — modelos da clínica
// POST /api/clinico/exames/modelos — cria um modelo
//
// Duas origens: montado na tela (itens informados) ou salvo a partir de um
// pedido já emitido (`fromRequestId`) — que é o caso de "transformar em modelo
// aquilo que a clínica acabou de pedir".

export const dynamic = 'force-dynamic';

const ItemSchema = z.object({
  name: z.string().trim().min(1),
  group: z.string().trim().min(1),
  subgroup: z.string().trim().optional().nullable(),
});

const CreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Dê um nome ao modelo').max(120),
    clinicalIndication: z.string().max(2000).optional(),
    observations: z.string().max(4000).optional(),
    items: z.array(ItemSchema).optional(),
    /** Salvar a partir de um pedido já emitido. */
    fromRequestId: z.string().optional(),
  })
  .refine((d) => (d.items && d.items.length > 0) || d.fromRequestId, {
    message: 'Informe os exames do modelo ou o pedido de origem',
  });

export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('clinico');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'clinico', 'view');
    if (denied) return denied;

    const modelos = await prisma.examTemplate.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    return NextResponse.json(
      modelos.map((m) => ({
        id: m.id,
        name: m.name,
        clinicalIndication: m.clinicalIndication,
        observations: m.observations,
        items: m.items.map((i) => ({ name: i.name, group: i.group, subgroup: i.subgroup })),
        totalExames: m.items.length,
      }))
    );
  } catch (err) {
    console.error('Erro ao listar modelos de pedido:', err);
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

    let items = d.items ?? [];
    let indicacao = d.clinicalIndication;
    let observacoes = d.observations;

    if (d.fromRequestId) {
      const pedido = await prisma.examRequest.findFirst({
        where: { id: d.fromRequestId, companyId: dbUser!.companyId, deletedAt: null },
        include: { items: { orderBy: { order: 'asc' } } },
      });
      if (!pedido) return NextResponse.json({ error: 'Pedido de origem não encontrado' }, { status: 404 });
      items = pedido.items.map((i) => ({ name: i.name, group: i.group, subgroup: i.subgroup }));
      // O que veio no corpo tem prioridade: permite renomear a indicação ao
      // salvar sem obrigar a reescrever a lista de exames.
      indicacao = indicacao ?? pedido.clinicalIndication;
      observacoes = observacoes ?? pedido.observations ?? undefined;
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'Modelo sem exames' }, { status: 400 });
    }

    const modelo = await prisma.examTemplate.create({
      data: {
        companyId: dbUser!.companyId,
        name: d.name,
        clinicalIndication: indicacao?.trim() || null,
        observations: observacoes?.trim() || null,
        createdByUserId: dbUser!.id,
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

    return NextResponse.json(modelo, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao criar modelo de pedido:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
