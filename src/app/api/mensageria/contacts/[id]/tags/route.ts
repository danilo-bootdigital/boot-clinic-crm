import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// GET /api/mensageria/contacts/[id]/tags — etiquetas atribuídas ao contato.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const contact = await prisma.contact.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
    if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });

    const links = await prisma.contactTag.findMany({
      where: { contactId: contact.id },
      include: { tag: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(links.map((l) => l.tag));
  } catch (err) {
    console.error('Erro ao listar etiquetas do contato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// Aceita etiqueta existente (tagId) OU cria pelo nome (name/color) e atribui.
const AttachSchema = z
  .object({
    tagId: z.string().optional(),
    name: z.string().min(1).optional(),
    color: z.string().optional(),
  })
  .refine((d) => d.tagId || d.name, { message: 'Informe tagId ou name' });

// POST /api/mensageria/contacts/[id]/tags — atribui (e cria, se preciso) uma etiqueta ao contato.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const contact = await prisma.contact.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
    if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });

    const d = AttachSchema.parse(await request.json());

    // Resolve a etiqueta: por id (validando empresa) ou por nome (cria/reaproveita).
    let tag;
    if (d.tagId) {
      tag = await prisma.tag.findFirst({ where: { id: d.tagId, companyId: dbUser!.companyId } });
      if (!tag) return NextResponse.json({ error: 'Etiqueta não encontrada nesta clínica' }, { status: 404 });
    } else {
      const name = d.name!.trim();
      // upsert no índice único (companyId, name) — evita corrida find-then-create
      // e reaproveita se a mesma etiqueta já existir (mesmo catálogo dos pacientes).
      tag = await prisma.tag.upsert({
        where: { companyId_name: { companyId: dbUser!.companyId, name } },
        update: {},
        create: { name, color: d.color || '#3B82F6', companyId: dbUser!.companyId },
      });
    }

    // Vincula (ignora se já vinculada).
    try {
      await prisma.contactTag.create({ data: { contactId: contact.id, tagId: tag.id } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }

    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atribuir etiqueta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
