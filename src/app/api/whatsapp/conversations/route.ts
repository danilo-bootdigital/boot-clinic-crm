import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser, requireRole, STAFF_ROLES } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { ownsPatient } from '@/lib/api/ownership';

const CreateSchema = z.object({
  contactName: z.string().min(1, 'Nome é obrigatório'),
  contactPhone: z.string().min(1, 'Telefone é obrigatório'),
  patientId: z.string().optional().or(z.literal('')),
});

// GET /api/whatsapp/conversations
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const convs = await prisma.whatsAppConversation.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });
    // Formato esperado pelo WhatsAppCentral.
    return NextResponse.json(convs.map((c) => ({
      id: c.id,
      patientId: c.patientId,
      patientName: c.contactName,
      contactId: c.id,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      status: c.status,
      contact: { name: c.contactName, phone: c.contactPhone },
    })));
  } catch (err) {
    console.error('Erro ao listar conversas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/whatsapp/conversations
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit') || requireRole(dbUser!, STAFF_ROLES);
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());
    if (!(await ownsPatient(dbUser!.companyId, d.patientId || null))) {
      return NextResponse.json({ error: 'Paciente inválido' }, { status: 400 });
    }

    const conv = await prisma.whatsAppConversation.create({
      data: { companyId: dbUser!.companyId, contactName: d.contactName, contactPhone: d.contactPhone, patientId: d.patientId || null },
    });
    return NextResponse.json(conv, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar conversa:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
