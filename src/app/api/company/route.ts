import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const UpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').optional(),
  cnpj: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')).nullable(),
  address: z.string().optional().nullable(),
});

// GET /api/company - dados da empresa do usuário
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'configuracoes', 'view');
    if (denied) return denied;
    const company = await prisma.company.findUnique({ where: { id: dbUser!.companyId } });
    if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    return NextResponse.json(company);
  } catch (err) {
    console.error('Erro ao buscar empresa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT /api/company - atualiza dados da empresa (somente gestão)
export async function PUT(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit');
    if (forbidden) return forbidden;

    const d = UpdateSchema.parse(await request.json());
    const company = await prisma.company.update({
      where: { id: dbUser!.companyId },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.cnpj !== undefined && { cnpj: d.cnpj || null }),
        ...(d.phone !== undefined && { phone: d.phone || null }),
        ...(d.email !== undefined && { email: d.email || null }),
        ...(d.address !== undefined && { address: d.address || null }),
      },
    });
    return NextResponse.json(company);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar empresa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
