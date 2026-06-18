import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveClinicalPatientAccess } from '@/lib/api/clinical-access';
import { writeAudit } from '@/lib/api/audit';
import { CreateClinicalQuoteSchema } from '@/lib/validations/clinical';

// Calcula subtotal/total a partir dos itens e desconto.
function computeTotals(items: { quantity: number; unitPrice: number }[], discount: number) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = Math.max(0, subtotal - (discount || 0));
  return { subtotal, total };
}

// GET /api/patients/[id]/quotes - orçamentos do paciente.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolveClinicalPatientAccess(params.id, 'orcamentos', 'view');
    if (error) return error;
    const rows = await prisma.clinicalQuote.findMany({
      where: { patientId: patient!.id, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error('Erro ao listar orçamentos:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/patients/[id]/quotes - cria orçamento (com itens).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolveClinicalPatientAccess(params.id, 'orcamentos', 'edit');
    if (error) return error;
    const d = CreateClinicalQuoteSchema.parse(await request.json());
    const items = (d.items || []).map((i) => ({ ...i, total: i.quantity * i.unitPrice }));
    const { subtotal, total } = computeTotals(items, d.discount || 0);

    const quote = await prisma.clinicalQuote.create({
      data: {
        companyId: dbUser!.companyId,
        patientId: patient!.id,
        title: d.title,
        status: d.status || 'DRAFT',
        discount: d.discount || 0,
        subtotal,
        total,
        validUntil: d.validUntil ? new Date(d.validUntil) : null,
        notes: d.notes || null,
        createdById: dbUser!.id,
        ...(d.status === 'SENT' && { sentAt: new Date() }),
        items: items.length
          ? { create: items.map((i) => ({ companyId: dbUser!.companyId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })) }
          : undefined,
      },
      include: { items: true },
    });

    await writeAudit({
      dbUser: dbUser!, action: 'CREATE', entityType: 'QUOTE', entityId: quote.id,
      newValues: { patientId: patient!.id, title: quote.title, total: quote.total }, request,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar orçamento:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
