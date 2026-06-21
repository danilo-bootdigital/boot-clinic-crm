import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// POST /api/whatsapp/webhook?token=... - recebe mensagens da Evolution API.
// Público (Evolution não tem sessão), protegido pelo token POR INSTÂNCIA — que
// identifica a instância (número) e, por ela, a clínica dona.
// Aceita um payload simplificado: { phone, name?, message }.
export async function POST(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Token ausente' }, { status: 401 });

    // Multiempresa: o token identifica a INSTÂNCIA (número) destinatária — e, por
    // ela, a clínica. Cada instância da Evolution usa a URL com o seu próprio token.
    let companyId: string | null = null;
    let instanceId: string | null = null;

    const instance = await prisma.whatsAppInstance.findFirst({
      where: { webhookToken: token },
      select: { id: true, companyId: true },
    });
    if (instance) {
      companyId = instance.companyId;
      instanceId = instance.id;
    } else {
      // Transição (legado): token por CLÍNICA (companies.whatsappWebhookToken). Roteia
      // para aquela clínica e tenta vincular à instância primária dela, se existir.
      // Sai de cena assim que cada instância tiver o seu token.
      const company = await prisma.company.findFirst({
        where: { whatsappWebhookToken: token, deletedAt: null },
        select: { id: true },
      });
      if (company) {
        companyId = company.id;
        const primary = await prisma.whatsAppInstance.findFirst({
          where: { companyId: company.id },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        instanceId = primary?.id ?? null;
      }
    }
    if (!companyId) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const event = String(body?.event || '').toLowerCase();

    // QRCODE_UPDATED: este servidor entrega o QR (base64) por aqui, não na resposta
    // HTTP do connect. Guardamos na instância para a tela/rota servir ao cliente.
    if (event.includes('qrcode')) {
      const qr = body?.data?.qrcode?.base64 ?? body?.data?.base64 ?? null;
      if (instanceId && qr) {
        await prisma.whatsAppInstance.update({ where: { id: instanceId }, data: { qrCode: qr, status: 'QRCODE' } });
      }
      return NextResponse.json({ success: true });
    }

    // CONNECTION_UPDATE: reflete o estado da sessão na instância (parear/cair).
    if (event.includes('connection')) {
      if (instanceId) {
        const raw = String(body?.data?.state ?? body?.data?.connection ?? '').toLowerCase();
        const statusMap: Record<string, 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'> = {
          open: 'CONNECTED', connecting: 'CONNECTING', close: 'DISCONNECTED', closed: 'DISCONNECTED',
        };
        const status = statusMap[raw];
        if (status) {
          const data: Record<string, any> = { status };
          if (status === 'CONNECTED') {
            data.lastConnectedAt = new Date();
            data.qrCode = null; // já pareou — QR não é mais necessário
            const jid: unknown = body?.data?.wuid || body?.data?.me?.id || body?.data?.instance?.owner;
            const phoneNumber = typeof jid === 'string' ? jid.split('@')[0].split(':')[0] : null;
            if (phoneNumber) data.phoneNumber = phoneNumber;
            const profileName = body?.data?.profileName || body?.data?.instance?.profileName;
            if (profileName) data.profileName = profileName;
          }
          if (status === 'DISCONNECTED') data.disconnectedAt = new Date();
          await prisma.whatsAppInstance.update({ where: { id: instanceId }, data });
        }
      }
      return NextResponse.json({ success: true });
    }

    // Mensagens nossas (fromMe) voltam no MESSAGES_UPSERT — ignoramos para não
    // duplicar a saída como entrada nem inflar o unreadCount.
    if (body?.data?.key?.fromMe === true) return NextResponse.json({ success: true, ignored: 'fromMe' });

    // Normaliza: aceita o formato simplificado ou tenta extrair do payload da Evolution.
    const phone: string | undefined = body.phone || body?.data?.key?.remoteJid?.split('@')?.[0];
    const text: string | undefined = body.message || body?.data?.message?.conversation;
    const name: string = body.name || body?.data?.pushName || phone || 'Contato';
    if (!phone || !text) return NextResponse.json({ error: 'Payload sem phone/message' }, { status: 400 });

    const digits = phone.replace(/\D/g, '');
    let conv = await prisma.whatsAppConversation.findFirst({
      where: { companyId, contactPhone: { contains: digits.slice(-8) }, deletedAt: null },
    });
    if (!conv) {
      conv = await prisma.whatsAppConversation.create({ data: { companyId, instanceId, contactName: name, contactPhone: phone } });
    } else if (!conv.instanceId && instanceId) {
      // Vincula a conversa à instância de chegada, se ainda não vinculada.
      conv = await prisma.whatsAppConversation.update({ where: { id: conv.id }, data: { instanceId } });
    }

    await prisma.whatsAppMessage.create({
      data: { companyId, conversationId: conv.id, instanceId: conv.instanceId ?? instanceId, content: text, direction: 'INCOMING', status: 'RECEIVED' },
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
