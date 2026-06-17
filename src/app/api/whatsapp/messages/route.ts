import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendWhatsappText } from '@/lib/whatsapp/evolution';

const CreateSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1, 'Mensagem vazia'),
  type: z.string().optional(),
});

function serialize(m: any) {
  return { id: m.id, conversationId: m.conversationId, content: m.content, direction: m.direction, isFromPatient: m.direction === 'INCOMING', status: m.status, createdAt: m.createdAt };
}

// GET /api/whatsapp/messages?conversationId=
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (!conversationId) return NextResponse.json([]);

    // Garante que a conversa é da empresa.
    const conv = await prisma.whatsAppConversation.findFirst({ where: { id: conversationId, companyId: dbUser!.companyId } });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    // Marca como lida.
    if (conv.unreadCount > 0) await prisma.whatsAppConversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });

    const msgs = await prisma.whatsAppMessage.findMany({ where: { conversationId, companyId: dbUser!.companyId }, orderBy: { createdAt: 'asc' } });
    return NextResponse.json(msgs.map(serialize));
  } catch (err) {
    console.error('Erro ao listar mensagens:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/whatsapp/messages - envia (via Evolution se configurada) ou grava como pendente.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());
    const conv = await prisma.whatsAppConversation.findFirst({ where: { id: d.conversationId, companyId: dbUser!.companyId, deletedAt: null } });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const sent = await sendWhatsappText(conv.contactPhone, d.content);
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';

    const msg = await prisma.whatsAppMessage.create({
      data: { companyId: dbUser!.companyId, conversationId: conv.id, content: d.content, direction: 'OUTGOING', status },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { lastMessage: d.content, lastMessageAt: new Date() },
    });
    return NextResponse.json(serialize(msg), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao enviar mensagem:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
