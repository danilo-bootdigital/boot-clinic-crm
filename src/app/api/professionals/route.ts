import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const Schema = z.object({
  name: z.string().min(1),
  crm: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  specialtyIds: z.array(z.string()).optional(),
});

// GET /api/professionals - lista (cria um profissional padrão na 1ª vez)
// ?activeOnly=1 → retorna só ativos (usado pelos seletores da agenda).
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'agenda', 'view');
    if (denied) return denied;

    const activeOnly = new URL(request.url).searchParams.get('activeOnly') === '1';

    const count = await prisma.professional.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.professional.create({
        data: { name: dbUser!.name || 'Dr(a). Responsável', companyId: dbUser!.companyId },
      });
    }

    const items = await prisma.professional.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null, ...(activeOnly && { isActive: true }) },
      orderBy: { name: 'asc' },
      include: { specialties: { select: { specialtyId: true, specialty: { select: { name: true } } } } },
    });
    // Achata as especialidades para o front: specialtyIds + specialtyNames.
    const result = items.map(({ specialties, ...p }) => ({
      ...p,
      specialtyIds: specialties.map((s) => s.specialtyId),
      specialtyNames: specialties.map((s) => s.specialty.name),
    }));
    return NextResponse.json(result);
  } catch (err) {
    console.error('Erro ao listar profissionais:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/professionals
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'agenda', 'edit');
    if (forbidden) return forbidden;
    const data = Schema.parse(await request.json());

    const item = await prisma.professional.create({
      data: {
        name: data.name,
        crm: data.crm || null,
        phone: data.phone || null,
        email: data.email || null,
        companyId: dbUser!.companyId,
      },
    });

    if (data.specialtyIds?.length) {
      // Só vincula especialidades que pertencem à própria empresa.
      const valid = await prisma.specialty.findMany({
        where: { id: { in: data.specialtyIds }, companyId: dbUser!.companyId, deletedAt: null },
        select: { id: true },
      });
      if (valid.length) {
        await prisma.professionalSpecialty.createMany({
          data: valid.map((s) => ({ professionalId: item.id, specialtyId: s.id, companyId: dbUser!.companyId })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar profissional:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
