import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

// DELETE /api/mensageria/contacts/[id]/tags/[tagId] — desvincula (não apaga a etiqueta do catálogo).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string; tagId: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const contact = await prisma.contact.findFirst({ where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null } });
    if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });

    const link = await prisma.contactTag.findFirst({ where: { contactId: contact.id, tagId: params.tagId } });
    if (!link) return NextResponse.json({ error: 'Etiqueta não vinculada a este contato' }, { status: 404 });

    await prisma.contactTag.delete({ where: { id: link.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao remover etiqueta do contato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
