import { looksLikeGroupId } from '@/lib/messaging/phone';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Channel, MessageSource, Prisma } from '@prisma/client';
import { ingestMessage, ingestInboundMedia, upsertContactProfile } from '@/lib/messaging/ingest';
import { extractText, jidToExternalId, jidToPhone, altPhoneFromKey, classifyMessage } from '@/lib/messaging/adapters/whatsapp/classify';
import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { downloadAndStoreInboundMedia } from '@/lib/messaging/adapters/whatsapp/media-inbound';
import { ackToStatus, statusPatch } from '@/lib/messaging/adapters/whatsapp/message-status';
import { hashPayload, newCorrelationId, safeEqualToken, logWebhookEvent, type WebhookStatus } from '@/lib/messaging/webhook-log';

// POST /api/mensageria/webhook?token=... - recebe mensagens da Evolution API.
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
//
// NOTA de plataforma: na Vercel, o corpo de uma Serverless Function é limitado a
// ~4.5 MB pela própria infra — então mídia inbound NÃO é recebida via base64 no
// webhook; ela é BAIXADA sob demanda da Evolution (ver ingest de mídia). Este cap
// é uma 2ª barreira; o teto efetivo em produção é o da Vercel.
const MAX_WEBHOOK_BYTES = 6 * 1024 * 1024;

// Normaliza o `data` da Evolution numa lista: array direto, ou `d[key]`, ou item único.
// A Evolution embrulha as coleções de formas diferentes por evento; centralizar aqui
// evita divergência silenciosa entre contacts/chats/messages.
function toList(d: any, key: string): any[] {
  return Array.isArray(d) ? d : d?.[key] || (d ? [d] : []);
}

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
    // Content-Type: a Evolution envia application/json. Se vier declarado e não for
    // JSON, rejeita (415). Ausência é tolerada p/ não quebrar clientes minimalistas.
    const contentType = request.headers.get('content-type');
    if (contentType && !contentType.toLowerCase().includes('json')) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'content-type inválido' });
      return NextResponse.json({ error: 'Content-Type deve ser application/json' }, { status: 415 });
    }
    const raw = await request.text();
    if (raw.length > MAX_WEBHOOK_BYTES) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, errorMessage: 'payload grande' });
      return NextResponse.json({ error: 'Payload muito grande' }, { status: 413 });
    }
    payloadHash = hashPayload(raw);
    // JSON inválido é erro do cliente → 400 explícito (não vira {} silenciosamente).
    let body: any;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, payloadHash, errorMessage: 'json inválido' });
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    // Multiempresa: o token identifica a INSTÂNCIA (número) destinatária — e, por
    // ela, a clínica. Cada instância da Evolution usa a URL com o seu próprio token.
    let instanceName: string | null = null;
    const instance = await prisma.channelAccount.findFirst({
      where: { webhookToken: token },
      select: { id: true, companyId: true, providerConfig: true },
    });
    if (instance) {
      companyId = instance.companyId;
      instanceId = instance.id;
      instanceName = waConfig(instance).instanceName;
    } else {
      // Transição (legado): token por CLÍNICA (companies.whatsappWebhookToken).
      const company = await prisma.company.findFirst({
        where: { whatsappWebhookToken: token, deletedAt: null },
        select: { id: true },
      });
      if (company) {
        companyId = company.id;
        const primary = await prisma.channelAccount.findFirst({
          where: { companyId: company.id, channel: Channel.WHATSAPP },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, companyId: true, providerConfig: true },
        });
        instanceId = primary?.id ?? null;
        instanceName = primary ? waConfig(primary).instanceName : null;
      }
    }
    if (!companyId) {
      await logWebhookEvent({ eventType, status: 'REJECTED', correlationId, payloadHash, errorMessage: 'token inválido' });
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    eventType = String(body?.event || '').toLowerCase() || 'unknown';

    const logAndRespond = async (status: WebhookStatus, extra: Record<string, any> = {}, messageType?: string | null, externalId?: string | null) => {
      await logWebhookEvent({ companyId, channel: Channel.WHATSAPP, accountId: instanceId, eventType, messageType, externalId, status, payloadHash, correlationId });
      return NextResponse.json({ success: true, ...extra });
    };

    // QRCODE_UPDATED: este servidor entrega o QR (base64) por aqui, não na resposta
    // HTTP do connect. Guardamos na instância para a tela/rota servir ao cliente.
    if (eventType.includes('qrcode')) {
      const qr = body?.data?.qrcode?.base64 ?? body?.data?.base64 ?? null;
      if (instanceId && qr) {
        const account = await prisma.channelAccount.findUnique({
          where: { id: instanceId },
          select: { id: true, companyId: true, providerConfig: true },
        });
        if (account) {
          await prisma.channelAccount.update({
            where: { id: instanceId },
            data: { providerConfig: waConfigPatch(account, { qrCode: qr }), status: 'QRCODE' },
          });
        }
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
          // O STATUS é a informação crítica: dele depende o badge da tela e o
          // diagnóstico do envio. Vai sozinho, primeiro. Antes, identidade e QR
          // iam no MESMO update — e como `qrCode`/`phoneNumber`/`profileName` não
          // são colunas de ChannelAccount (o QR vive em providerConfig, o número
          // em externalId, o nome em displayName), todo evento de reconexão
          // estourava e levava o "CONNECTED" com ele. A conta ficava parada em
          // DISCONNECTED e o envio caía em PENDING silencioso.
          // TIPADO de propósito: era `Record<string, any>`, e foi esse `any` que
          // deixou passar a gravação de colunas inexistentes por 240 eventos. Com
          // o tipo do Prisma, o mesmo erro não compila.
          const data: Prisma.ChannelAccountUpdateInput = { status };
          if (status === 'CONNECTED') {
            data.lastConnectedAt = new Date();
            data.disconnectedAt = null;
          }
          if (status === 'DISCONNECTED') data.disconnectedAt = new Date();
          await prisma.channelAccount.update({ where: { id: instanceId }, data });

          // Identidade do número pareado + descarte do QR: best-effort, nas colunas
          // reais. Falhar aqui (ex.: outra conta já usa esse número, @@unique
          // channel+externalId) não pode desfazer o status gravado acima.
          if (status === 'CONNECTED') {
            const jid: unknown = body?.data?.wuid || body?.data?.me?.id || body?.data?.instance?.owner;
            const phoneNumber = typeof jid === 'string' ? jid.split('@')[0].split(':')[0] : null;
            const profileName = body?.data?.profileName || body?.data?.instance?.profileName;
            try {
              const account = await prisma.channelAccount.findUnique({
                where: { id: instanceId },
                select: { id: true, companyId: true, providerConfig: true },
              });
              if (account) {
                await prisma.channelAccount.update({
                  where: { id: instanceId },
                  data: {
                    ...(phoneNumber ? { externalId: phoneNumber } : {}),
                    ...(profileName ? { displayName: String(profileName) } : {}),
                    // Já pareou — o QR não serve mais e mora no providerConfig.
                    providerConfig: waConfigPatch(account, { qrCode: null }),
                  },
                });
              }
            } catch (e) {
              console.error('[mensageria] identidade da instância não atualizada:', e instanceof Error ? e.message : e);
            }
          }
        }
      }
      return logAndRespond('PROCESSED');
    }

    const d = body?.data;

    // CONTACTS_SET / CONTACTS_UPDATE: nome e foto dos contatos (não cria conversa).
    if (eventType.includes('contacts')) {
      const list: any[] = toList(d, 'contacts');
      for (const c of list) {
        const externalId = jidToExternalId(c?.id || c?.remoteJid);
        if (!externalId || looksLikeGroupId(c?.id || c?.remoteJid) || looksLikeGroupId(externalId)) continue;
        await upsertContactProfile({
          companyId,
          channel: Channel.WHATSAPP,
          externalId,
          name: c?.pushName || c?.name || c?.notify,
          avatarUrl: c?.profilePicUrl || c?.profilePictureUrl,
          phone: jidToPhone(c?.id || c?.remoteJid),
        });
      }
      return logAndRespond('PROCESSED', { processed: list.length });
    }

    // CHATS_SET / CHATS_UPSERT: cria/atualiza as conversas (threads) existentes.
    if (eventType.includes('chats')) {
      const list: any[] = toList(d, 'chats');
      let n = 0;
      for (const c of list) {
        const externalId = jidToExternalId(c?.id || c?.remoteJid);
        if (!externalId || looksLikeGroupId(c?.id || c?.remoteJid) || looksLikeGroupId(externalId)) continue; // ignora grupos por ora
        await upsertContactProfile({
          companyId,
          channel: Channel.WHATSAPP,
          externalId,
          name: c?.name || c?.pushName,
          phone: jidToPhone(c?.id || c?.remoteJid),
        });
        n++;
      }
      return logAndRespond('PROCESSED', { processed: n });
    }

    // MESSAGES_UPDATE: ACK de status (enviado/entregue/lido) das mensagens que ENVIAMOS.
    // Atualiza status + carimbos, sem rebaixar. Dedup por (instanceId, externalId).
    if (eventType.includes('messages.update') || eventType.includes('messages_update')) {
      const list: any[] = toList(d, 'messages');
      const now = new Date();
      const scopedCompanyId = companyId; // garantido não-nulo acima; fixa o narrowing no closure
      // Batch: cada ACK é independente (linhas distintas) → resolve em paralelo em vez de
      // 2N round-trips sequenciais. companyId escopa a busca p/ nunca cruzar clínicas
      // (a rota legada pode deixar instanceId=null, e null não isola por @@unique).
      const results = await Promise.all(list.map(async (u) => {
        const extId = u?.keyId || u?.key?.id || u?.id;
        const raw = u?.status ?? u?.update?.status ?? u?.ack;
        if (!extId) return false;
        const next = ackToStatus(raw);
        if (!next) return false;
        const msg = await prisma.message.findFirst({
          where: { companyId: scopedCompanyId, accountId: instanceId, externalId: extId, direction: 'OUTGOING' },
          select: { id: true, status: true, deliveredAt: true, readAt: true },
        });
        if (!msg) return false;
        const patch = statusPatch(msg, next, now);
        if (!patch) return false;
        await prisma.message.update({ where: { id: msg.id }, data: patch });
        return true;
      }));
      const updated = results.filter(Boolean).length;
      return logAndRespond(updated > 0 ? 'PROCESSED' : 'SKIPPED', { updated, total: list.length });
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
        raws = toList(d, 'messages');
      }
      // Mídia suportada (baixada sob demanda): imagem, documento e áudio.
      const SUPPORTED_MEDIA = new Set(['IMAGE', 'DOCUMENT', 'AUDIO']);
      let created = 0, dup = 0, placeholder = 0, skipped = 0, media = 0, mediaFailed = 0;
      let firstType: string | null = null;
      let firstExternalId: string | null = null;
      for (const msg of raws) {
        // Identidade != telefone: `@lid` é id opaco do WhatsApp, não número.
        const externalId = jidToExternalId(msg?.key?.remoteJid);
        if (!externalId || looksLikeGroupId(msg?.key?.remoteJid) || looksLikeGroupId(externalId)) { skipped++; continue; } // grupos: fora por ora
        // Remetente `@lid` não traz telefone no jid; alguns payloads mandam à parte.
        const phone = jidToPhone(msg?.key?.remoteJid) ?? altPhoneFromKey(msg?.key);
        const text = extractText(msg?.message);
        const mtype = classifyMessage(msg?.message);
        if (!firstType) firstType = mtype;
        if (!firstExternalId) firstExternalId = msg?.key?.id ?? null;
        const ts = msg?.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : undefined;

        // IMAGEM/DOCUMENTO: cria a mensagem (mediaStatus PENDING) e baixa o arquivo.
        // Se o download falhar, a mensagem PERMANECE (placeholder, mediaStatus FAILED).
        if (mtype && SUPPORTED_MEDIA.has(mtype) && instanceName) {
          const ing = await ingestInboundMedia({
            companyId,
            provenance: {
              channel: Channel.WHATSAPP,
              accountId: instanceId,
              source: msg?.key?.fromMe === true ? MessageSource.MOBILE : MessageSource.CONTACT,
            },
            contact: { externalId, name: msg?.pushName, phone },
            messageKind: mtype, caption: text ?? null,
            externalId: msg?.key?.id ?? null, createdAt: ts,
          });
          if (ing.status === 'duplicate') { dup++; continue; }
          if (ing.status !== 'created' || !ing.messageId || !ing.conversationId) { skipped++; continue; }
          created++;
          const r = await downloadAndStoreInboundMedia({
            instance: { id: instanceId!, companyId: companyId!, providerConfig: { instanceName } }, rawMessage: msg,
            message: { id: ing.messageId, companyId: companyId!, conversationId: ing.conversationId },
          });
          if (r === 'available') media++; else if (r === 'failed') mediaFailed++;
          continue;
        }

        // Texto e demais tipos: comportamento atual (texto ou placeholder controlado).
        const r = await ingestMessage({
          companyId,
          // Etiqueta de procedência (§4.3): canal + conta de entrada + quem
          // produziu. fromMe=true = enviada pelo celular, fora do CRM.
          provenance: {
            channel: Channel.WHATSAPP,
            accountId: instanceId,
            source: msg?.key?.fromMe === true ? MessageSource.MOBILE : MessageSource.CONTACT,
          },
          contact: { externalId, name: msg?.pushName, phone },
          text,
          messageKind: mtype,
          externalId: msg?.key?.id ?? null,
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
      return logAndRespond(status, { created, placeholder, media, mediaFailed, duplicate: dup, skipped, total: raws.length }, firstType, firstExternalId);
    }

    // Evento não tratado (ex.: presence, message ack) — aceita sem erro.
    return logAndRespond('SKIPPED', { ignored: eventType });
  } catch (err) {
    // Falha crítica: registra evento sanitizado (sem payload/segredo) para diagnóstico.
    console.error('Erro no webhook WhatsApp:', err);
    await logWebhookEvent({
      companyId, channel: Channel.WHATSAPP, accountId: instanceId, eventType, status: 'FAILED', payloadHash, correlationId,
      errorMessage: err instanceof Error ? err.message : 'erro desconhecido',
    });
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
