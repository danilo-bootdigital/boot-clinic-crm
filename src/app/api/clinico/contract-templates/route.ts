import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { CreateContractTemplateSchema } from '@/lib/validations/clinical';

// GET /api/clinico/contract-templates - modelos de contrato da clínica.
export async function GET() {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'view');
    if (error) return error;
    const templates = await prisma.contractTemplate.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(templates);
  } catch (err) {
    console.error('Erro ao listar modelos de contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/clinico/contract-templates - cria modelo.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const d = CreateContractTemplateSchema.parse(await request.json());
    const tpl = await prisma.contractTemplate.create({
      data: {
        name: d.name,
        description: d.description || null,
        content: d.content,
        isActive: d.isActive ?? true,
        companyId: dbUser!.companyId,
        createdById: dbUser!.id,
      },
    });
    return NextResponse.json(tpl, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar modelo de contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
