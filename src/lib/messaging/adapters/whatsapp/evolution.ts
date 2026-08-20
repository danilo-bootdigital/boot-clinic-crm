// Integração com a Evolution API — multiempresa (Fase 1).
//
// O servidor da Evolution (URL + apikey de administração) é compartilhado, mas
// CADA CLÍNICA tem a SUA própria instância (número/sessão). Por isso todas as
// operações abaixo recebem a instância vinculada à clínica (ChannelAccount).
// NÃO há mais WHATSAPP_INSTANCE global.
//
// Variáveis usadas: WHATSAPP_API_URL (base do servidor Evolution) e
// WHATSAPP_API_KEY (apikey de administração do servidor).

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { Channel, type ChannelAccount, type ChannelAccountStatus } from '@prisma/client';
import { instanceNameFor, waConfig, waConfigPatch, whatsappAccountWhere } from './account';

// Resultado padrão das chamadas: `configured` indica se a base está configurada.
export type EvoResult<T = unknown> = { configured: boolean; ok: boolean; data?: T; error?: string };

// Endereçar uma instância na Evolution exige o nome dela, que vive no
// providerConfig da conta — por isso o ref é a conta (ou o mínimo p/ derivá-la).
type InstanceRef = { id?: string; companyId: string; providerConfig?: unknown };

// Nome da instância na Evolution a partir de um ref.
function refName(instance: InstanceRef): string {
  return waConfig({ id: instance.id ?? '', companyId: instance.companyId, providerConfig: (instance.providerConfig ?? null) as never }).instanceName;
}

// True se a BASE da Evolution (servidor + apikey admin) está configurada.
// Não depende mais de instância global — a instância é resolvida por clínica.
export function isEvolutionConfigured(): boolean {
  const url = process.env.WHATSAPP_API_URL;
  const key = process.env.WHATSAPP_API_KEY;
  if (!url || !key) return false;
  if (/localhost:3001|your-api-key/.test(`${url}${key}`)) return false;
  return true;
}

function base() {
  return { url: process.env.WHATSAPP_API_URL!.replace(/\/$/, ''), key: process.env.WHATSAPP_API_KEY! };
}

// Wrapper genérico de chamada à Evolution. Já injeta a apikey e trata erros de rede.
async function evo<T = any>(path: string, init: RequestInit): Promise<EvoResult<T>> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const { url, key } = base();
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: key, ...(init.headers || {}) },
    });
    const data = (await res.json().catch(() => null)) as T;
    return { configured: true, ok: res.ok, data, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    return { configured: true, ok: false, error: e?.message };
  }
}

// Resolve a instância PRIMÁRIA da clínica (ou a mais antiga, se nenhuma marcada).
// Usada quando não há instância específica vinculada (ex.: telemedicina, fallback).
export function getPrimaryInstance(companyId: string) {
  // Filtra por canal: a clínica tem contas de vários canais e este adapter só
  // responde pelo WhatsApp.
  return prisma.channelAccount.findFirst({
    where: { companyId, channel: Channel.WHATSAPP },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

// Garante a instância "Principal" da clínica (cria o REGISTRO se não existir — não
// chama a Evolution). Idempotente: reaproveita a primária existente. Cada clínica
// começa com 1 instância primária, com token de webhook próprio.
export async function ensurePrimaryInstance(companyId: string): Promise<ChannelAccount> {
  const existing = await getPrimaryInstance(companyId);
  if (existing) {
    // Backfill defensivo: garante token de webhook em instâncias antigas sem token.
    if (existing.webhookToken) return existing;
    return prisma.channelAccount.update({
      where: { id: existing.id },
      data: { webhookToken: `wh_${randomUUID().replace(/-/g, '')}` },
    });
  }
  return prisma.channelAccount.create({
    data: {
      companyId,
      channel: Channel.WHATSAPP,
      providerConfig: { instanceName: instanceNameFor(companyId) },
      label: 'Principal',
      isPrimary: true,
      webhookToken: `wh_${randomUUID().replace(/-/g, '')}`,
    },
  });
}

// Resumo seguro de uma instância para devolver ao frontend (sem token/QR cru).
export function instanceSummary(i: ChannelAccount) {
  return {
    id: i.id,
    label: i.label,
    isPrimary: i.isPrimary,
    status: i.status,
    channel: i.channel,
    phoneNumber: i.externalId,
    profileName: i.displayName,
    lastConnectedAt: i.lastConnectedAt,
    disconnectedAt: i.disconnectedAt,
  };
}

// Monta a URL do webhook inbound desta instância (carrega o token que identifica
// a instância e, por ela, a clínica). `origin` é o fallback quando não há env.
export function instanceWebhookUrl(origin: string, token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin;
  return `${baseUrl.replace(/\/$/, '')}/api/mensageria/webhook?token=${token}`;
}

// Extrai o QR Code (base64) das várias formas que a Evolution retorna (create/connect).
export function extractQr(data: any): string | null {
  return data?.qrcode?.base64 ?? data?.base64 ?? (typeof data?.qrcode === 'string' ? data.qrcode : null) ?? null;
}

// --- Operações por instância (sempre da clínica) -------------------------------

// Eventos assinados no webhook. MESSAGES_UPDATE traz o ACK de status (enviado/
// entregue/lido). Sem `events`, a Evolution não entrega nada.
export const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED', 'CONNECTION_UPDATE',
  'MESSAGES_UPSERT', 'MESSAGES_SET', 'MESSAGES_UPDATE',
  'CHATS_SET', 'CONTACTS_SET',
];

// Versão da lista de eventos acima. Instâncias gravam a versão que já registraram
// (ChannelAccount.webhookEventsVersion); só re-registramos quando estiver defasada
// — evita uma chamada HTTP a cada reconnect. BUMP ao mudar WEBHOOK_EVENTS.
export const WEBHOOK_EVENTS_VERSION = 1;

// Cria a instância na Evolution (QR habilitado). `webhookUrl` aponta o inbound
// para o endpoint da clínica (com o token dela), quando informado.
export async function createInstance(instance: InstanceRef, opts?: { webhookUrl?: string }): Promise<EvoResult> {
  return evo('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: refName(instance),
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      ...(opts?.webhookUrl
        ? { webhook: { url: opts.webhookUrl, byEvents: false, base64: true, events: WEBHOOK_EVENTS } }
        : {}),
    }),
  });
}

// (Re)registra o webhook de uma instância JÁ existente com a lista atual de eventos —
// usado para "refrescar" instâncias antigas e passarem a receber MESSAGES_UPDATE.
export async function setInstanceWebhook(instance: InstanceRef, webhookUrl: string): Promise<EvoResult> {
  return evo(`/webhook/set/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: true, events: WEBHOOK_EVENTS } }),
  });
}

// Abre a conexão e retorna o QR Code (base64 / pairing code) para parear.
export async function getQrCode(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/connect/${encodeURIComponent(refName(instance))}`, { method: 'GET' });
}

// Consulta o estado da conexão e o normaliza para o enum do nosso schema.
export async function getConnectionState(
  instance: InstanceRef,
): Promise<EvoResult & { state?: ChannelAccountStatus }> {
  const res = await evo<any>(`/instance/connectionState/${encodeURIComponent(refName(instance))}`, { method: 'GET' });
  const raw = res.data?.instance?.state ?? res.data?.state;
  const map: Record<string, ChannelAccountStatus> = {
    open: 'CONNECTED',
    connecting: 'CONNECTING',
    close: 'DISCONNECTED',
    closed: 'DISCONNECTED',
  };
  return { ...res, state: raw ? map[String(raw)] ?? 'ERROR' : undefined };
}

// Consulta o estado real na Evolution e RECONCILIA no banco (best-effort). Atualiza
// status, lastConnectedAt (ao conectar) e disconnectedAt (ao cair). Devolve a
// instância (possivelmente) atualizada. Nunca lança — em erro, retorna a atual.
export async function syncConnectionState(instance: ChannelAccount): Promise<ChannelAccount> {
  if (!isEvolutionConfigured() || !waConfig(instance).evolutionInstanceId) return instance;
  const res = await getConnectionState(instance);
  if (!res.ok || !res.state || res.state === instance.status) return instance;
  const data: Record<string, any> = { status: res.state };
  if (res.state === 'CONNECTED') data.lastConnectedAt = new Date();
  if (res.state === 'DISCONNECTED') data.disconnectedAt = new Date();
  try {
    return await prisma.channelAccount.update({ where: { id: instance.id }, data });
  } catch {
    return instance;
  }
}

// Desconecta (logout) a sessão da instância — exige novo QR para reconectar.
export async function logoutInstance(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/logout/${encodeURIComponent(refName(instance))}`, { method: 'DELETE' });
}

// Reabre a conexão de uma instância já criada (mesmo endpoint de connect).
export async function reconnectInstance(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/connect/${encodeURIComponent(refName(instance))}`, { method: 'GET' });
}

// Lista os chats (conversas) existentes na instância — para importar o histórico.
// Resposta: array plano de chats { id, remoteJid, pushName, profilePicUrl, lastMessage, unreadCount }.
export async function findChats(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/chat/findChats/${encodeURIComponent(refName(instance))}`, { method: 'POST', body: JSON.stringify({}) });
}

/**
 * Lista os contatos conhecidos pela instância. É a fonte em LOTE dos nomes: o
 * WhatsApp entrega o `pushName` (nome que a própria pessoa pôs no perfil dela),
 * que é o que dá para exibir. Nome da agenda do celular não é exposto por API.
 */
export async function findContacts(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/chat/findContacts/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Lista mensagens (página recente, ou de um remoteJid). Resposta: { messages: { records: [...] } }.
export async function findMessages(instance: InstanceRef, opts?: { remoteJid?: string }): Promise<EvoResult> {
  const where = opts?.remoteJid ? { key: { remoteJid: opts.remoteJid } } : {};
  return evo(`/chat/findMessages/${encodeURIComponent(refName(instance))}`, { method: 'POST', body: JSON.stringify({ where }) });
}

// Envia uma mensagem de texto PELA instância da clínica. Devolve também o
// `messageId` (key.id do WhatsApp) para deduplicar o eco que volta no MESSAGES_UPSERT.
export async function sendMessage(
  instance: InstanceRef,
  phone: string,
  text: string,
): Promise<EvoResult & { messageId?: string }> {
  const res = await evo<any>(`/message/sendText/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone.replace(/\D/g, ''), text }),
  });
  return { ...res, messageId: res.data?.key?.id ?? undefined };
}

// --- Conveniência para as rotas que só têm o companyId -------------------------

// Instância de saída da conversa (ou a primária da clínica).
//
// O status em CACHE não veta mais o envio. Ele fica velho — o CONNECTION_UPDATE
// de volta ao ar podia se perder e a conta seguia marcada DISCONNECTED por dias —
// e o veto aqui virava `configured:false`, que a rota gravava como PENDING sem
// erro: a mensagem "ficava enviando" para sempre e nunca saía. Quem decide se dá
// para enviar é o provedor, na resposta HTTP. Se ele recusar, a mensagem vira
// FAILED com motivo legível e o atendente pode reenviar.
function resolveSendInstance(conv: { companyId: string; instanceId: string | null }) {
  return conv.instanceId
    ? prisma.channelAccount.findFirst({ where: { id: conv.instanceId, companyId: conv.companyId } })
    : getPrimaryInstance(conv.companyId);
}

const NO_INSTANCE = 'clínica sem número de WhatsApp cadastrado';

// Motivo da falha em linguagem de atendente, e reconciliação do cache: confere o
// estado real da instância para separar "o número caiu" de "o provedor recusou".
// Nunca lança — na dúvida, devolve o erro cru do provedor.
async function sendFailureReason(instance: ChannelAccount, res: EvoResult): Promise<string> {
  let status = instance.status;
  try {
    status = (await syncConnectionState(instance)).status;
  } catch {
    /* mantém o status em cache */
  }
  return status === 'CONNECTED'
    ? `o WhatsApp recusou o envio (${res.error ?? 'erro do provedor'})`
    : 'WhatsApp desconectado — reconecte o número em Configurações';
}

// Envia pela instância PRIMÁRIA da clínica (sem conversa específica — ex.: avisos
// de telemedicina). `configured:false` só quando o SERVIDOR não está configurado
// (sem env) — aí a rota grava PENDING. Instância caída é falha, não pendência.
export async function sendWhatsappForCompany(
  companyId: string,
  phone: string,
  text: string,
): Promise<EvoResult> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = await getPrimaryInstance(companyId);
  if (!instance) return { configured: true, ok: false, error: NO_INSTANCE };
  const res = await sendMessage(instance, phone, text);
  if (!res.ok) return { ...res, error: await sendFailureReason(instance, res) };
  return res;
}

// Envia pela instância vinculada à CONVERSA. Se `instanceId` é null, cai na
// primária da clínica. Retorna também o `instanceId` efetivamente usado, para a
// rota carimbar a mensagem (e vincular a conversa na 1ª saída).
export async function sendWhatsappForConversation(
  conv: { companyId: string; instanceId: string | null },
  phone: string,
  text: string,
): Promise<EvoResult & { instanceId?: string; messageId?: string }> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = await resolveSendInstance(conv);
  if (!instance) return { configured: true, ok: false, error: NO_INSTANCE };
  const res = await sendMessage(instance, phone, text);
  const error = res.ok ? undefined : await sendFailureReason(instance, res);
  return { ...res, error, instanceId: instance.id };
}

// --- Mídia (imagem/documento) ---------------------------------------------------
// Contrato Evolution v2 (WHATSAPP-BAILEYS): POST /message/sendMedia/{instance} com
// { number, mediatype, mimetype, media(base64), fileName, caption? } → { key.id }.
// VALIDADO AO VIVO em v2.3.7 (2026-07-14): JSON+base64 é aceito (201 + key.id);
// multipart/form-data é REJEITADO ("Unexpected field"). Usamos base64 (não expõe
// nosso storage privado; envio server→server). Obs.: o servidor RE-PROCESSA a
// imagem — bytes inválidos → 500; por isso validamos magic-bytes antes de enviar.
export type EvoMediaType = 'image' | 'document' | 'audio';

export async function sendMediaMessage(
  instance: InstanceRef,
  phone: string,
  opts: { mediatype: EvoMediaType; mimetype: string; base64: string; fileName: string; caption?: string },
): Promise<EvoResult & { messageId?: string }> {
  const res = await evo<any>(`/message/sendMedia/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({
      number: phone.replace(/\D/g, ''),
      mediatype: opts.mediatype,
      mimetype: opts.mimetype,
      media: opts.base64,
      fileName: opts.fileName,
      ...(opts.caption ? { caption: opts.caption } : {}),
    }),
  });
  return { ...res, messageId: res.data?.key?.id ?? undefined };
}

// Envia mídia pela instância da CONVERSA (fallback primária). Espelha sendWhatsappForConversation.
export async function sendMediaForConversation(
  conv: { companyId: string; instanceId: string | null },
  phone: string,
  opts: { mediatype: EvoMediaType; mimetype: string; base64: string; fileName: string; caption?: string },
): Promise<EvoResult & { instanceId?: string; messageId?: string }> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = await resolveSendInstance(conv);
  if (!instance) return { configured: true, ok: false, error: NO_INSTANCE };
  const res = await sendMediaMessage(instance, phone, opts);
  const error = res.ok ? undefined : await sendFailureReason(instance, res);
  return { ...res, error, instanceId: instance.id };
}

// Áudio como NOTA DE VOZ (PTT). Contrato v2: POST /message/sendWhatsAppAudio/{instance}
// { number, audio(base64) } → { key.id }. VALIDADO AO VIVO em v2.3.7 (2026-07-15):
// 201 + key.id. O servidor converte p/ ogg/opus (renderiza como áudio de voz).
export async function sendWhatsappAudio(
  instance: InstanceRef,
  phone: string,
  base64: string,
): Promise<EvoResult & { messageId?: string }> {
  const res = await evo<any>(`/message/sendWhatsAppAudio/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone.replace(/\D/g, ''), audio: base64 }),
  });
  return { ...res, messageId: res.data?.key?.id ?? undefined };
}

// Envia áudio (nota de voz) pela instância da CONVERSA (fallback primária).
export async function sendAudioForConversation(
  conv: { companyId: string; instanceId: string | null },
  phone: string,
  base64: string,
): Promise<EvoResult & { instanceId?: string; messageId?: string }> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = await resolveSendInstance(conv);
  if (!instance) return { configured: true, ok: false, error: NO_INSTANCE };
  const res = await sendWhatsappAudio(instance, phone, base64);
  const error = res.ok ? undefined : await sendFailureReason(instance, res);
  return { ...res, error, instanceId: instance.id };
}

// Baixa a mídia de uma mensagem recebida (base64), SOB DEMANDA — não dependemos do
// base64 do webhook (limite ~4.5MB da Vercel). Contrato v2: POST
// /chat/getBase64FromMediaMessage/{instance} { message } → { base64, mimetype, fileName }.
// VALIDADO AO VIVO em v2.3.7 (2026-07-14): retorna 201 com base64+mimetype+fileName.
export async function getMediaBase64(
  instance: InstanceRef,
  rawMessage: any,
): Promise<EvoResult & { base64?: string; mimetype?: string; fileName?: string }> {
  const res = await evo<any>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(refName(instance))}`, {
    method: 'POST',
    body: JSON.stringify({ message: rawMessage, convertToMp4: false }),
  });
  const d: any = res.data || {};
  return { ...res, base64: d.base64 ?? d.media ?? undefined, mimetype: d.mimetype ?? undefined, fileName: d.fileName ?? undefined };
}

// Carrega a instância (com instanceName) por id dentro da empresa — usado p/ resolver
// a instância antes de baixar mídia inbound.
export function getInstanceById(id: string, companyId: string) {
  return prisma.channelAccount.findFirst({ where: { id, companyId } });
}
