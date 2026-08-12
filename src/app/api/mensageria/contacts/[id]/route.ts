import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ContactNameSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';

// PATCH /api/mensageria/contacts/[id] — renomeia (ou edita) o contato.
//
// Nome editado à mão grava `nameSource = MANUAL`, e a partir daí o canal NUNCA
// sobrescreve (ver lib/messaging/contacts.ts). É o que faz a correção da
// recepcionista sobreviver à próxima mensagem que chegar.

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(120).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').max(160).optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    // Escopo por empresa: contato de outra clínica não existe para este usuário.
    const contact = await prisma.contact.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
    });
    if (!contact) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });

    const d = PatchSchema.parse(await request.json());

    const data: Record<string, unknown> = {};
    if (d.name && d.name !== contact.name) {
      data.name = d.name;
      // A marca é o ponto todo: sem ela, o próximo pushName desfaz a edição.
      data.nameSource = ContactNameSource.MANUAL;
    }
    if (d.phone !== undefined) data.phone = d.phone || null;
    if (d.email !== undefined) data.email = d.email || null;
    if (d.notes !== undefined) data.notes = d.notes || null;

    if (!Object.keys(data).length) {
      return NextResponse.json({ contact: { id: contact.id, name: contact.name, nameSource: contact.nameSource } });
    }

    const updated = await prisma.contact.update({ where: { id: contact.id }, data });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.WHATSAPP_CONVERSATION,
      entityId: contact.id,
      oldValues: { name: contact.name, nameSource: contact.nameSource, phone: contact.phone },
      newValues: { name: updated.name, nameSource: updated.nameSource, phone: updated.phone },
      request,
    });

    return NextResponse.json({
      contact: {
        id: updated.id,
        name: updated.name,
        nameSource: updated.nameSource,
        phone: updated.phone,
        email: updated.email,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    }
    console.error('Erro ao editar contato:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
