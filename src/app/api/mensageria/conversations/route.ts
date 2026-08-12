import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser, requireRole, STAFF_ROLES } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient } from '@/lib/api/ownership';
import { Channel } from '@prisma/client';
import { resolveContact } from '@/lib/messaging/contacts';

const CreateSchema = z.object({
  // Canal é obrigatório: conversa sem canal não tem etiqueta de procedência
  // possível (§4.3). Default WHATSAPP mantém compatível quem já chamava a rota.
  channel: z.nativeEnum(Channel).default(Channel.WHATSAPP),
  contactName: z.string().min(1, 'Nome é obrigatório'),
  contactPhone: z.string().min(1, 'Telefone é obrigatório'),
  patientId: z.string().optional().or(z.literal('')),
});

// GET /api/mensageria/conversations
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const convs = await prisma.conversation.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      // NULLS LAST é essencial: o Postgres põe NULL PRIMEIRO em DESC, então
      // conversa sem mensagem nenhuma (importada de findChats) subia para o topo
      // e enterrava o atendimento real embaixo de centenas de threads vazias.
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        contact: { select: { id: true, name: true, phone: true, patientId: true } },
        account: { select: { id: true, label: true, channel: true } },
      },
    });
    // Formato consumido pela tela da mensageria. Cada item carrega a etiqueta de
    // procedência (canal + conta de entrada) — a tela não deduz nada (§4.3).
    return NextResponse.json(convs.map((c) => ({
      id: c.id,
      channel: c.channel,
      account: c.account ? { id: c.account.id, label: c.account.label } : null,
      entryPoint: c.entryPoint,
      contactId: c.contactId,
      patientId: c.contact.patientId,
      patientName: c.contact.name,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      status: c.status,
      contact: { id: c.contact.id, name: c.contact.name, phone: c.contact.phone },
    })));
  } catch (err) {
    console.error('Erro ao listar conversas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/mensageria/conversations
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit') || requireRole(dbUser!, STAFF_ROLES);
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());
    if (!(await ownsPatient(dbUser!.companyId, d.patientId || null))) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }

    // Conversa criada pela tela: resolve/cria o contato (a identidade mora nele,
    // não na conversa) e abre a thread no canal informado.
    const { contact } = await resolveContact({
      companyId: dbUser!.companyId,
      channel: d.channel,
      externalId: d.contactPhone,
      name: d.contactName,
      phone: d.contactPhone,
    });
    if (d.patientId && !contact.patientId) {
      await prisma.contact.update({ where: { id: contact.id }, data: { patientId: d.patientId } });
    }
    const conv = await prisma.conversation.create({
      data: {
        companyId: dbUser!.companyId,
        channel: d.channel,
        contactId: contact.id,
      },
    });
    return NextResponse.json(conv, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar conversa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
