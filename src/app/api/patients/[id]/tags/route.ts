import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolvePatientAccess } from '@/lib/api/patient-access';
import { writeAudit } from '@/lib/api/audit';

// GET /api/patients/[id]/tags - tags atribuídas ao paciente.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { patient, error } = await resolvePatientAccess(params.id, 'view');
    if (error) return error;

    const links = await prisma.patientTag.findMany({
      where: { patientId: patient!.id },
      include: { tag: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(links.map((l) => l.tag));
  } catch (err) {
    console.error('Erro ao listar tags do paciente:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Aceita tag existente (tagId) OU cria pelo nome (name/color) e atribui.
const AttachSchema = z.object({
  tagId: z.string().optional(),
  name: z.string().min(1).optional(),
  color: z.string().optional(),
}).refine((d) => d.tagId || d.name, { message: 'Informe tagId ou name' });

// POST /api/patients/[id]/tags - atribui (e cria, se preciso) uma tag ao paciente.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, patient, error } = await resolvePatientAccess(params.id, 'edit');
    if (error) return error;

    const d = AttachSchema.parse(await request.json());

    // Resolve a tag: por id (validando empresa) ou por nome (cria/reaproveita).
    let tag;
    if (d.tagId) {
      tag = await prisma.tag.findFirst({ where: { id: d.tagId, companyId: dbUser!.companyId } });
      if (!tag) return NextResponse.json({ error: 'Tag não encontrada nesta clínica' }, { status: 404 });
    } else {
      const name = d.name!.trim();
      tag = await prisma.tag.findFirst({ where: { companyId: dbUser!.companyId, name } });
      if (!tag) {
        tag = await prisma.tag.create({ data: { name, color: d.color || '#3B82F6', companyId: dbUser!.companyId } });
      }
    }

    // Vincula (ignora se já vinculada).
    try {
      await prisma.patientTag.create({ data: { patientId: patient!.id, tagId: tag.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }

    await writeAudit({
      dbUser: dbUser!, action: 'ADD_TAG', entityType: 'PATIENT', entityId: patient!.id,
      newValues: { tag: tag.name }, request,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atribuir tag:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
