// Cliente da Graph API para Instagram Messaging.
//
// Fronteira do adapter: quem fala com a Meta é este módulo. O núcleo
// (lib/messaging/ingest.ts) não sabe que Meta existe.
//
// Nunca loga token nem corpo de resposta cru — só código/mensagem sanitizados.
import { prisma } from '@/lib/db/prisma';
import { Channel, MessageSource } from '@prisma/client';
import { pageAccessToken } from './account';

const GRAPH = 'https://graph.facebook.com/v21.0';

export type GraphResult<T = unknown> = {
  configured: boolean;
  ok: boolean;
  data?: T;
  error?: string;
};

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function sanitize(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? 'erro');
  // Remove qualquer coisa com cara de token de acesso da mensagem de erro.
  return text.replace(/EAA[A-Za-z0-9_-]{20,}/g, '[token]').slice(0, 200);
}

async function graph<T>(path: string, init?: RequestInit): Promise<GraphResult<T>> {
  if (!isInstagramConfigured()) return { configured: false, ok: false, error: 'Meta não configurada' };
  try {
    const res = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const err = body?.error;
      return {
        configured: true,
        ok: false,
        error: sanitize(err?.message || `HTTP ${res.status}`),
      };
    }
    return { configured: true, ok: true, data: body as T };
  } catch (e) {
    return { configured: true, ok: false, error: sanitize(e) };
  }
}

// --- OAuth ----------------------------------------------------------------

/** URL de autorização. O usuário abre isso, loga na Meta e autoriza. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    // Escopos mínimos para ler/responder DM de Instagram de uma Página.
    scope: [
      'instagram_basic',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_manage_metadata',
      'pages_messaging',
      'business_management',
    ].join(','),
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/** Troca o `code` do callback por um token de usuário de curta duração. */
export async function exchangeCodeForUserToken(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    client_secret: process.env.META_APP_SECRET || '',
    redirect_uri: redirectUri,
    code,
  });
  return graph<{ access_token: string; expires_in?: number }>(`/oauth/access_token?${params}`, {
    method: 'GET',
  });
}

/**
 * Lista as Páginas do usuário com o Instagram ligado a cada uma. O token de
 * PÁGINA que vem aqui é o que usamos para mensageria — ele não expira como o de
 * usuário, desde que a permissão siga concedida.
 */
export async function listPagesWithInstagram(userToken: string) {
  const params = new URLSearchParams({
    access_token: userToken,
    fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
  });
  return graph<{
    data: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
    }>;
  }>(`/me/accounts?${params}`);
}

/** Assina o webhook de mensagens para esta Página. */
export async function subscribePageToWebhook(pageId: string, pageToken: string) {
  const params = new URLSearchParams({
    access_token: pageToken,
    subscribed_fields: 'messages,messaging_postbacks,messaging_referral',
  });
  return graph<{ success: boolean }>(`/${pageId}/subscribed_apps?${params}`, { method: 'POST' });
}

// --- Perfil e envio -------------------------------------------------------

/**
 * Nome/foto de quem mandou a DM. O webhook do Instagram entrega só o IGSID —
 * diferente do WhatsApp, que já manda o pushName no payload.
 */
export async function getSenderProfile(igsid: string, pageToken: string) {
  const params = new URLSearchParams({ access_token: pageToken, fields: 'name,username,profile_pic' });
  return graph<{ name?: string; username?: string; profile_pic?: string }>(`/${igsid}?${params}`);
}

/**
 * A janela de 24h da Meta: só é permitido responder livremente até 24h depois
 * da ÚLTIMA mensagem do usuário. Fora disso a API recusa.
 *
 * Checamos ANTES de chamar a Meta, de propósito: assim a recusa é nossa, com
 * mensagem clara para o atendente, em vez de um erro opaco do provedor.
 */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function replyWindow(conversationId: string): Promise<{
  open: boolean;
  lastInboundAt: Date | null;
  closesAt: Date | null;
}> {
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, source: MessageSource.CONTACT, channel: Channel.INSTAGRAM },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!lastInbound) return { open: false, lastInboundAt: null, closesAt: null };
  const closesAt = new Date(lastInbound.createdAt.getTime() + REPLY_WINDOW_MS);
  return { open: closesAt.getTime() > Date.now(), lastInboundAt: lastInbound.createdAt, closesAt };
}

/** Envia texto para um IGSID pela Página. */
export async function sendInstagramText(
  account: { id: string; companyId: string; providerConfig: unknown },
  igsid: string,
  text: string
): Promise<GraphResult<{ message_id?: string }> & { messageId?: string | null }> {
  const token = pageAccessToken(account as never);
  if (!token) return { configured: true, ok: false, error: 'Conta do Instagram sem token válido' };

  const cfg = (account.providerConfig ?? {}) as Record<string, unknown>;
  const pageId = typeof cfg.pageId === 'string' ? cfg.pageId : null;
  if (!pageId) return { configured: true, ok: false, error: 'Conta do Instagram sem Página vinculada' };

  const res = await graph<{ message_id?: string }>(`/${pageId}/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
  });
  return { ...res, messageId: res.data?.message_id ?? null };
}
