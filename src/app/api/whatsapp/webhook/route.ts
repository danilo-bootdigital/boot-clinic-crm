import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ingestMessage, upsertContact, extractText, jidToPhone, classifyMessage } from '@/lib/whatsapp/ingest';
import { hashPayload, newCorrelationId, safeEqualToken, logWebhookEvent, type WebhookStatus } from '@/lib/whatsapp/webhook-log';

// POST /api/whatsapp/webhook?token=... - recebe mensagens da Evolution API.
// Público (Evolution não tem sessão), protegido pelo token POR INSTÂNCIA — que
// identifica a instância (número) e, por ela, a clínica dona.
// Aceita um payload simplificado: { phone, name?, message }.
//
// Segurança (Etapa G):
//  - A Evolution (WHATSAPP-BAILEYS) NÃO assina o webhook com HMAC nativo, então a
//    autenticação primária é o token por instância (secreto, único por número).
//  - Segredo ADICIONAL opcional: se WHATSAPP_WEBHOOK_SECRET estiver definido no
//    servidor, exige o header `x-webhook-secret` (comparação em tempo constante).
//    Sem a env, o comportamento atual é mantido (transição sem quebrar webhooks).
//  - Cap de tamanho do corpo p/ evitar abuso; idempotência preservada no ingest.
const MAX_WEBHOOK_BYTES = 6 * 1024 * 1024; // generoso p/ QR/base64; ajustável

export async function POST(request: NextRequest) {
  const correlationId = newCorrelationId();
  let companyId: string | null = null;
  let instanceId: string | null = null;
  let eventType = 'unknown';
  let payloadHash: string | null = null;

  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'token ausente' });
      return NextResponse.json({ error: 'Token ausente' }, { status: 401 });
    }

    // Segredo adicional opcional (só valida se configurado no servidor).
    const requiredSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (requiredSecret && !safeEqualToken(request.headers.get('x-webhook-secret'), requiredSecret)) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'segredo inválido' });
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Cap de tamanho (defesa contra abuso). content-length é uma dica; validamos o real.
    const declaredLen = Number(request.headers.get('content-length') || 0);
    if (declaredLen && declaredLen > MAX_WEBHOOK_BYTES) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'payload grande' });
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_WEBHOOK_BYTES) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'payload grande' });
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
    }
    payloadHash = hashPayload(raw);
    const body = ((): any => { try { return JSON.parse(raw); } catch { return {}; } })();

    // Multiempresa: o token identifica a INSTÂNCIA (número) destinatária — e, por
    // ela, a clínica. Cada instância da Evolution usa a URL com o seu próprio token.
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { webhookToken: token },
      select: { id: true, companyId: true },
    });
    if (instance) {
      companyId = instance.companyId;
      instanceId = instance.id;
    } else {
      // Transição (legado): token por CLÍNICA (companies.whatsappWebhookToken).
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
    if (!companyId) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, payloadHash, errorMessage: 'token inválido' });
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    eventType = String(body?.event || '').toLowerCase() || 'unknown';

    const logAndRespond = async (status: WebhookStatus, extra: Record<string, any> = {}, messageType?: string | null, externalId?: string | null) => {
      await logWebhookEvent({ companyId, instanceId, eventType, messageType, externalId, status, payloadHash, correlationId });
      return NextResponse.json({ success: true, ...extra });
    };

    // QRCODE_UPDATED: este servidor entrega o QR (base64) por aqui, não na resposta
    // HTTP do connect. Guardamos na instância para a tela/rota servir ao cliente.
    if (eventType.includes('qrcode')) {
      const qr = body?.data?.qrcode?.base64 ?? body?.data?.base64 ?? null;
      if (instanceId && qr) {
        await prisma.whatsAppInstance.update({ where: { id: instanceId }, data: { qrCode: qr, status: 'QRCODE' } });
      }
      return logAndRespond('PROCESSED');
    }

    // CONNECTION_UPDATE: reflete o estado da sessão na instância (parear/cair).
    if (eventType.includes('connection')) {
      if (instanceId) {
        const rawState = String(body?.data?.state ?? body?.data?.connection ?? '').toLowerCase();
        const statusMap: Record<string, 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'> = {
          open: 'CONNECTED', connecting: 'CONNECTING', close: 'DISCONNECTED', closed: 'DISCONNECTED',
        };
        const status = statusMap[rawState];
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
      return logAndRespond('PROCESSED');
    }

    const d = body?.data;

    // CONTACTS_SET / CONTACTS_UPDATE: nome e foto dos contatos (não cria conversa).
    if (eventType.includes('contacts')) {
      const list: any[] = Array.isArray(d) ? d : d?.contacts || (d ? [d] : []);
      for (const c of list) {
        const phone = jidToPhone(c?.id || c?.remoteJid);
        if (!phone) continue;
        await upsertContact({ companyId, phone, name: c?.pushName || c?.name || c?.notify, avatar: c?.profilePicUrl || c?.profilePictureUrl });
      }
      return logAndRespond('PROCESSED', { processed: list.length });
    }

    // CHATS_SET / CHATS_UPSERT: cria/atualiza as conversas (threads) existentes.
    if (eventType.includes('chats')) {
      const list: any[] = Array.isArray(d) ? d : d?.chats || (d ? [d] : []);
      let n = 0;
      for (const c of list) {
        const phone = jidToPhone(c?.id || c?.remoteJid);
        if (!phone || (c?.id && String(c.id).includes('@g.us'))) continue; // ignora grupos por ora
        await upsertContact({ companyId, phone, name: c?.name || c?.pushName });
        n++;
      }
      return logAndRespond('PROCESSED', { processed: n });
    }

    // MESSAGES_SET (histórico) e MESSAGES_UPSERT (tempo real). Mesma ingestão; o flag
    // isHistory evita inflar não-lidas e respeita a ordem temporal no histórico.
    const isHistory = eventType.includes('messages.set') || eventType.includes('messages_set');
    const isUpsert = eventType.includes('messages.upsert') || eventType.includes('messages_upsert');

    if (isHistory || isUpsert || (!body?.event && (body.phone || body.message))) {
      // Normaliza para uma lista de mensagens cruas do WhatsApp.
      let raws: any[];
      if (!body?.event && (body.phone || body.message)) {
        raws = [{ key: { remoteJid: body.phone, fromMe: false }, message: { conversation: body.message }, pushName: body.name }];
      } else {
        raws = Array.isArray(d) ? d : d?.messages || (d ? [d] : []);
      }
      let created = 0, dup = 0, placeholder = 0, skipped = 0;
      let firstType: string | null = null;
      let firstExternalId: string | null = null;
      for (const msg of raws) {
        const phone = jidToPhone(msg?.key?.remoteJid);
        if (!phone || String(msg?.key?.remoteJid || '').includes('@g.us')) { skipped++; continue; } // grupos: fora por ora
        const text = extractText(msg?.message);
        const mtype = classifyMessage(msg?.message);
        if (!firstType) firstType = mtype;
        if (!firstExternalId) firstExternalId = msg?.key?.id ?? null;
        const ts = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : undefined;
        const r = await ingestMessage({
          companyId,
          instanceId,
          phone,
          name: msg?.pushName,
          text,
          messageType: mtype,
          externalId: msg?.key?.id ?? null,
          fromMe: msg?.key?.fromMe === true,
          createdAt: ts,
          isHistory,
        });
        if (r === 'created') created++;
        else if (r === 'placeholder') placeholder++;
        else if (r === 'duplicate') dup++;
        else skipped++;
      }
      const status: WebhookStatus =
        created + placeholder > 0 ? 'PROCESSED' : dup > 0 ? 'DUPLICATE' : 'SKIPPED';
      return logAndRespond(status, { created, placeholder, duplicate: dup, skipped, total: raws.length }, firstType, firstExternalId);
    }

    // Evento não tratado (ex.: presence, message ack) — aceita sem erro.
    return logAndRespond('SKIPPED', { ignored: eventType });
  } catch (err) {
    // Falha crítica: registra evento sanitizado (sem payload/segredo) para diagnóstico.
    console.error('Erro no webhook WhatsApp:', err);
    await logWebhookEvent({
      companyId, instanceId, eventType, status: 'FAILED', payloadHash, correlationId,
      errorMessage: err instanceof Error ? err.message : 'erro desconhecido',
    });
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
