import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { sendWhatsappForConversation } from '@/lib/whatsapp/evolution';

const CreateSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1, 'Mensagem vazia'),
  type: z.string().optional(),
});

function serialize(m: any) {
  const att = m.attachments?.find((a: any) => !a.deletedAt) ?? null;
  return {
    id: m.id, conversationId: m.conversationId, content: m.content,
    messageType: m.messageType ?? 'TEXT', caption: m.caption ?? null,
    mediaStatus: m.mediaStatus ?? null,
    direction: m.direction, isFromPatient: m.direction === 'INCOMING',
    status: m.status, sentAt: m.sentAt ?? null, deliveredAt: m.deliveredAt ?? null,
    readAt: m.readAt ?? null, createdAt: m.createdAt,
    // Nunca expõe storagePath — só metadados + o id p/ buscar a signed URL sob demanda.
    attachment: att ? { id: att.id, mimeType: att.mimeType, sizeBytes: att.sizeBytes, originalFileName: att.originalFileName } : null,
  };
}

// GET /api/whatsapp/messages?conversationId=
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
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

    const msgs = await prisma.whatsAppMessage.findMany({
      where: { conversationId, companyId: dbUser!.companyId },
      include: { attachments: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(msgs.map(serialize));
  } catch (err) {
    console.error('Erro ao listar mensagens:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/whatsapp/messages - envia (via Evolution se configurada) ou grava como pendente.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const d = CreateSchema.parse(await request.json());
    const conv = await prisma.whatsAppConversation.findFirst({ where: { id: d.conversationId, companyId: dbUser!.companyId, deletedAt: null } });
    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const sent = await sendWhatsappForConversation({ companyId: dbUser!.companyId, instanceId: conv.instanceId }, conv.contactPhone, d.content);
    const status = !sent.configured ? 'PENDING' : sent.ok ? 'SENT' : 'FAILED';
    const usedInstanceId = sent.instanceId ?? conv.instanceId ?? null;

    const msg = await prisma.whatsAppMessage.create({
      // externalId = id retornado pela Evolution → o eco fromMe no MESSAGES_UPSERT casa
      // por essa chave e NÃO é gravado de novo. source=CRM distingue do envio pelo celular.
      data: {
        companyId: dbUser!.companyId, conversationId: conv.id, instanceId: usedInstanceId,
        externalId: sent.messageId ?? null, source: 'CRM', content: d.content,
        messageType: 'TEXT', direction: 'OUTGOING', status,
        createdByUserId: dbUser!.id,
        sentAt: status === 'SENT' ? new Date() : null,
        failedAt: status === 'FAILED' ? new Date() : null,
      },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      // Vincula a conversa à instância usada na 1ª saída (não sobrescreve se já houver).
      data: { lastMessage: d.content, lastMessageAt: new Date(), instanceId: conv.instanceId ?? usedInstanceId ?? undefined },
    });
    return NextResponse.json(serialize(msg), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao enviar mensagem:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
