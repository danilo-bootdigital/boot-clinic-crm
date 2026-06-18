import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { CreateContractTemplateSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.contractTemplate.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'view');
    if (error) return error;
    const tpl = await findOwned(params.id, dbUser!.companyId);
    if (!tpl) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
    return NextResponse.json(tpl);
  } catch (err) {
    console.error('Erro ao buscar modelo de contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
    const d = CreateContractTemplateSchema.partial().parse(await request.json());
    const tpl = await prisma.contractTemplate.update({
      where: { id: params.id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.description !== undefined && { description: d.description || null }),
        ...(d.content !== undefined && { content: d.content }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
      },
    });
    return NextResponse.json(tpl);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar modelo de contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('contratos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
    await prisma.contractTemplate.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir modelo de contrato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
