import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';

const Schema = z.object({
  name: z.string().min(1),
  crm: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

// GET /api/professionals - lista (cria um profissional padrão na 1ª vez)
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;

    const count = await prisma.professional.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.professional.create({
        data: { name: dbUser!.name || 'Dr(a). Responsável', companyId: dbUser!.companyId },
      });
    }

    const items = await prisma.professional.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(items);
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
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar profissional:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
