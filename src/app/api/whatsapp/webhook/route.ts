import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ingestMessage, upsertContact, extractText, jidToPhone } from '@/lib/whatsapp/ingest';

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

    const d = body?.data;

    // CONTACTS_SET / CONTACTS_UPDATE: nome e foto dos contatos (não cria conversa).
    if (event.includes('contacts')) {
      const list: any[] = Array.isArray(d) ? d : d?.contacts || (d ? [d] : []);
      for (const c of list) {
        const phone = jidToPhone(c?.id || c?.remoteJid);
        if (!phone) continue;
        await upsertContact({ companyId, phone, name: c?.pushName || c?.name || c?.notify, avatar: c?.profilePicUrl || c?.profilePictureUrl });
      }
      return NextResponse.json({ success: true, processed: list.length });
    }

    // CHATS_SET / CHATS_UPSERT: cria/atualiza as conversas (threads) existentes.
    if (event.includes('chats')) {
      const list: any[] = Array.isArray(d) ? d : d?.chats || (d ? [d] : []);
      let n = 0;
      for (const c of list) {
        const phone = jidToPhone(c?.id || c?.remoteJid);
        if (!phone || (c?.id && String(c.id).includes('@g.us'))) continue; // ignora grupos por ora
        await upsertContact({ companyId, phone, name: c?.name || c?.pushName });
        n++;
      }
      return NextResponse.json({ success: true, processed: n });
    }

    // MESSAGES_SET (histórico) e MESSAGES_UPSERT (tempo real). Mesma ingestão; o flag
    // isHistory evita inflar não-lidas e respeita a ordem temporal no histórico.
    const isHistory = event.includes('messages.set') || event.includes('messages_set');
    const isUpsert = event.includes('messages.upsert') || event.includes('messages_upsert');

    if (isHistory || isUpsert || (!event && (body.phone || body.message))) {
      // Normaliza para uma lista de mensagens cruas do WhatsApp.
      let raw: any[];
      if (!event && (body.phone || body.message)) {
        raw = [{ key: { remoteJid: body.phone, fromMe: false }, message: { conversation: body.message }, pushName: body.name }];
      } else {
        raw = Array.isArray(d) ? d : d?.messages || (d ? [d] : []);
      }
      let created = 0, dup = 0;
      for (const msg of raw) {
        const phone = jidToPhone(msg?.key?.remoteJid);
        if (!phone || String(msg?.key?.remoteJid || '').includes('@g.us')) continue; // grupos: fora por ora
        const text = extractText(msg?.message);
        const ts = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : undefined;
        const r = await ingestMessage({
          companyId,
          instanceId,
          phone,
          name: msg?.pushName,
          text,
          externalId: msg?.key?.id ?? null,
          fromMe: msg?.key?.fromMe === true,
          createdAt: ts,
          isHistory,
        });
        if (r === 'created') created++; else if (r === 'duplicate') dup++;
      }
      return NextResponse.json({ success: true, created, duplicate: dup, total: raw.length });
    }

    // Evento não tratado (ex.: presence, message ack) — aceita sem erro.
    return NextResponse.json({ success: true, ignored: event || 'unknown' });
  } catch (err) {
    console.error('Erro no webhook WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
