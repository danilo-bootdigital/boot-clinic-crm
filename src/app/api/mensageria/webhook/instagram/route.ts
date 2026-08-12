import { NextRequest, NextResponse } from 'next/server';
import { Channel, MessageSource } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ingestMessage } from '@/lib/messaging/ingest';
import { hashPayload, newCorrelationId, logWebhookEvent, type WebhookStatus } from '@/lib/messaging/webhook-log';
import { parseInstagramWebhook } from '@/lib/messaging/adapters/instagram/classify';
import { resolveHubChallenge, verifyMetaSignature } from '@/lib/messaging/adapters/instagram/webhook-verify';
import { getSenderProfile } from '@/lib/messaging/adapters/instagram/graph';
import { igConfig, pageAccessToken } from '@/lib/messaging/adapters/instagram/account';

// Webhook do Instagram (Meta Messenger Platform).
//
// Público por natureza — a Meta não tem sessão. A autenticação é a assinatura
// X-Hub-Signature-256 sobre o corpo CRU (nunca o JSON reserializado).
//
// Diferente do WhatsApp, a clínica NÃO é identificada por um token na URL: a
// Meta manda um webhook único para o app e diz em qual conta caiu
// (recipient.id). É esse IGSID que resolve o ChannelAccount → clínica.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET — handshake de verificação do painel da Meta.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const result = resolveHubChallenge({
    mode: p.get('hub.mode'),
    verifyToken: p.get('hub.verify_token'),
    challenge: p.get('hub.challenge'),
  });
  if (!result.ok) {
    await logWebhookEvent({
      channel: Channel.INSTAGRAM,
      eventType: 'hub.verify',
      status: 'REJECTED',
      errorMessage: 'verify_token invalido ou ausente',
    });
    return new NextResponse('Forbidden', { status: 403 });
  }
  // A Meta espera o challenge CRU, text/plain — não JSON.
  return new NextResponse(result.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  const correlationId = newCorrelationId();
  let payloadHash: string | null = null;

  try {
    // Corpo CRU: reserializar quebraria a assinatura.
    const rawBody = await request.text();
    payloadHash = hashPayload(rawBody);

    if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
      await logWebhookEvent({
        channel: Channel.INSTAGRAM,
        eventType: 'messages',
        status: 'REJECTED',
        payloadHash,
        correlationId,
        errorMessage: 'assinatura invalida',
      });
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
    }

    const body = JSON.parse(rawBody || '{}');
    const inbound = parseInstagramWebhook(body);
    if (!inbound.length) {
      await logWebhookEvent({
        channel: Channel.INSTAGRAM,
        eventType: 'messages',
        status: 'SKIPPED',
        payloadHash,
        correlationId,
      });
      return NextResponse.json({ success: true, ignored: 'sem mensagem utilizavel' });
    }

    let created = 0, dup = 0, skipped = 0;
    let firstExternalId: string | null = null;

    for (const msg of inbound) {
      if (!firstExternalId) firstExternalId = msg.externalId;

      // Eco da nossa própria mensagem: já gravamos no envio, e o dedup por
      // (accountId, externalId) cobre o resto. Não vira mensagem nova.
      if (msg.isEcho) { dup++; continue; }

      // A conta que RECEBEU identifica a clínica. Sem conta cadastrada, o
      // evento é registrado e descartado — nunca adivinhamos a clínica.
      const account = await prisma.channelAccount.findFirst({
        where: { channel: Channel.INSTAGRAM, externalId: msg.recipientId },
      });
      if (!account) { skipped++; continue; }

      // Nome/@ do remetente: o Instagram só manda o IGSID, então buscamos o
      // perfil. Falha aqui não impede a mensagem de entrar (nome fica o IGSID
      // até a próxima tentativa) — perder a mensagem seria pior.
      let senderName: string | null = null;
      let senderHandle: string | null = null;
      let senderAvatar: string | null = null;
      const token = pageAccessToken(account);
      if (token) {
        const profile = await getSenderProfile(msg.senderId, token);
        if (profile.ok) {
          senderName = profile.data?.name ?? null;
          senderHandle = profile.data?.username ?? null;
          senderAvatar = profile.data?.profile_pic ?? null;
        }
      }

      const result = await ingestMessage({
        companyId: account.companyId,
        // Etiqueta de procedência (§4.3): canal, conta de entrada e quem
        // produziu. Mensagem de webhook não-eco é sempre do contato.
        provenance: {
          channel: Channel.INSTAGRAM,
          accountId: account.id,
          source: MessageSource.CONTACT,
          entryPoint: msg.entryPoint,
          referral: msg.referral,
        },
        contact: {
          externalId: msg.senderId,
          name: senderName,
          handle: senderHandle,
          avatarUrl: senderAvatar,
        },
        text: msg.text,
        messageKind: msg.kind,
        externalId: msg.externalId,
        createdAt: msg.createdAt,
      });

      if (result === 'created' || result === 'placeholder') created++;
      else if (result === 'duplicate') dup++;
      else skipped++;
    }

    const status: WebhookStatus = created > 0 ? 'PROCESSED' : dup > 0 ? 'DUPLICATE' : 'SKIPPED';
    await logWebhookEvent({
      channel: Channel.INSTAGRAM,
      eventType: 'messages',
      status,
      externalId: firstExternalId,
      payloadHash,
      correlationId,
    });
    return NextResponse.json({ success: true, created, duplicate: dup, skipped });
  } catch (err) {
    console.error('Erro no webhook Instagram:', err);
    await logWebhookEvent({
      channel: Channel.INSTAGRAM,
      eventType: 'messages',
      status: 'FAILED',
      payloadHash,
      correlationId,
      errorMessage: err instanceof Error ? err.message : 'erro desconhecido',
    });
    // 200 de propósito seria errado aqui: queremos que a Meta reentregue.
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
