import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalUser } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { UpdateClinicalQuoteSchema } from '@/lib/validations/clinical';

async function findOwned(id: string, companyId: string) {
  return prisma.clinicalQuote.findFirst({ where: { id, companyId, deletedAt: null }, include: { items: true } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('orcamentos', 'view');
    if (error) return error;
    const row = await findOwned(params.id, dbUser!.companyId);
    if (!row) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    console.error('Erro ao buscar orçamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - atualiza dados/status e (opcional) substitui itens, recalculando totais.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('orcamentos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    const d = UpdateClinicalQuoteSchema.parse(await request.json());

    const discount = d.discount !== undefined ? d.discount : existing.discount;
    const items = d.items
      ? d.items.map((i) => ({ ...i, total: i.quantity * i.unitPrice }))
      : existing.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total }));
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const total = Math.max(0, subtotal - (discount || 0));

    const statusStamp: any = {};
    if (d.status && d.status !== existing.status) {
      if (d.status === 'SENT') statusStamp.sentAt = new Date();
      if (d.status === 'APPROVED') statusStamp.approvedAt = new Date();
      if (d.status === 'REJECTED') statusStamp.rejectedAt = new Date();
    }

    const row = await prisma.$transaction(async (tx) => {
      await tx.clinicalQuote.update({
        where: { id: params.id },
        data: {
          ...(d.title !== undefined && { title: d.title }),
          ...(d.status !== undefined && { status: d.status }),
          ...(d.notes !== undefined && { notes: d.notes || null }),
          ...(d.validUntil !== undefined && { validUntil: d.validUntil ? new Date(d.validUntil) : null }),
          discount: discount || 0,
          subtotal,
          total,
          ...statusStamp,
        },
      });
      if (d.items) {
        await tx.clinicalQuoteItem.deleteMany({ where: { quoteId: params.id } });
        if (items.length) {
          await tx.clinicalQuoteItem.createMany({
            data: items.map((i) => ({ quoteId: params.id, companyId: dbUser!.companyId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
          });
        }
      }
      return tx.clinicalQuote.findUnique({ where: { id: params.id }, include: { items: true } });
    });

    await writeAudit({
      dbUser: dbUser!, action: 'UPDATE', entityType: 'QUOTE', entityId: params.id,
      oldValues: { status: existing.status }, newValues: { status: row?.status, total: row?.total }, request,
    });
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar orçamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveClinicalUser('orcamentos', 'edit');
    if (error) return error;
    const existing = await findOwned(params.id, dbUser!.companyId);
    if (!existing) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    await prisma.clinicalQuote.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    await writeAudit({ dbUser: dbUser!, action: 'ARCHIVE', entityType: 'QUOTE', entityId: params.id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir orçamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
