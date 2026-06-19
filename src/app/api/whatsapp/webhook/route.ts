import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// POST /api/whatsapp/webhook?token=... - recebe mensagens da Evolution API.
// Público (Evolution não tem sessão), protegido por token compartilhado.
// Aceita um payload simplificado: { phone, name?, message }.
export async function POST(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Token ausente' }, { status: 401 });

    // SEC2 — multiempresa: o token POR CLÍNICA autentica E identifica a clínica
    // destinatária. Cada instância da Evolution usa a URL com o seu próprio token.
    let company = await prisma.company.findFirst({
      where: { whatsappWebhookToken: token, deletedAt: null },
      select: { id: true },
    });

    // Transição: enquanto a clínica ativa não tiver token próprio configurado, aceita
    // o token global legado (WHATSAPP_WEBHOOK_TOKEN) roteando para a 1ª clínica. Some
    // assim que cada clínica tiver seu token — aí o fallback nunca é acionado.
    if (!company) {
      const legacy = process.env.WHATSAPP_WEBHOOK_TOKEN || process.env.WHATSAPP_API_KEY;
      if (legacy && token === legacy) {
        company = await prisma.company.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
      }
    }
    if (!company) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    // Normaliza: aceita o formato simplificado ou tenta extrair do payload da Evolution.
    const phone: string | undefined = body.phone || body?.data?.key?.remoteJid?.split('@')?.[0];
    const text: string | undefined = body.message || body?.data?.message?.conversation;
    const name: string = body.name || body?.data?.pushName || phone || 'Contato';
    if (!phone || !text) return NextResponse.json({ error: 'Payload sem phone/message' }, { status: 400 });

    const digits = phone.replace(/\D/g, '');
    let conv = await prisma.whatsAppConversation.findFirst({
      where: { companyId: company.id, contactPhone: { contains: digits.slice(-8) }, deletedAt: null },
    });
    if (!conv) {
      conv = await prisma.whatsAppConversation.create({ data: { companyId: company.id, contactName: name, contactPhone: phone } });
    }

    await prisma.whatsAppMessage.create({
      data: { companyId: company.id, conversationId: conv.id, content: text, direction: 'INCOMING', status: 'RECEIVED' },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { lastMessage: text, lastMessageAt: new Date(), unreadCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro no webhook WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
