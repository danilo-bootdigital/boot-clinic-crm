// Integração com a Evolution API — multiempresa (Fase 1).
//
// O servidor da Evolution (URL + apikey de administração) é compartilhado, mas
// CADA CLÍNICA tem a SUA própria instância (número/sessão). Por isso todas as
// operações abaixo recebem a instância vinculada à clínica (WhatsAppInstance).
// NÃO há mais WHATSAPP_INSTANCE global.
//
// Variáveis usadas: WHATSAPP_API_URL (base do servidor Evolution) e
// WHATSAPP_API_KEY (apikey de administração do servidor).

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import type { WhatsAppInstance, WhatsAppInstanceStatus } from '@prisma/client';

// Resultado padrão das chamadas: `configured` indica se a base está configurada.
export type EvoResult<T = unknown> = { configured: boolean; ok: boolean; data?: T; error?: string };

// Subconjunto mínimo necessário para endereçar uma instância na Evolution.
type InstanceRef = Pick<WhatsAppInstance, 'instanceName'>;

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
  return prisma.whatsAppInstance.findFirst({
    where: { companyId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

// Garante a instância "Principal" da clínica (cria o REGISTRO se não existir — não
// chama a Evolution). Idempotente: reaproveita a primária existente. Cada clínica
// começa com 1 instância primária, com token de webhook próprio.
export async function ensurePrimaryInstance(companyId: string): Promise<WhatsAppInstance> {
  const existing = await getPrimaryInstance(companyId);
  if (existing) {
    // Backfill defensivo: garante token de webhook em instâncias antigas sem token.
    if (existing.webhookToken) return existing;
    return prisma.whatsAppInstance.update({
      where: { id: existing.id },
      data: { webhookToken: `wh_${randomUUID().replace(/-/g, '')}` },
    });
  }
  return prisma.whatsAppInstance.create({
    data: {
      companyId,
      instanceName: `clinic_${companyId}`,
      label: 'Principal',
      isPrimary: true,
      webhookToken: `wh_${randomUUID().replace(/-/g, '')}`,
    },
  });
}

// Resumo seguro de uma instância para devolver ao frontend (sem token/QR cru).
export function instanceSummary(i: WhatsAppInstance) {
  return {
    id: i.id,
    label: i.label,
    isPrimary: i.isPrimary,
    status: i.status,
    phoneNumber: i.phoneNumber,
    profileName: i.profileName,
    lastConnectedAt: i.lastConnectedAt,
    disconnectedAt: i.disconnectedAt,
  };
}

// Monta a URL do webhook inbound desta instância (carrega o token que identifica
// a instância e, por ela, a clínica). `origin` é o fallback quando não há env.
export function instanceWebhookUrl(origin: string, token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin;
  return `${baseUrl.replace(/\/$/, '')}/api/whatsapp/webhook?token=${token}`;
}

// Extrai o QR Code (base64) das várias formas que a Evolution retorna (create/connect).
export function extractQr(data: any): string | null {
  return data?.qrcode?.base64 ?? data?.base64 ?? (typeof data?.qrcode === 'string' ? data.qrcode : null) ?? null;
}

// --- Operações por instância (sempre da clínica) -------------------------------

// Cria a instância na Evolution (QR habilitado). `webhookUrl` aponta o inbound
// para o endpoint da clínica (com o token dela), quando informado.
export async function createInstance(instance: InstanceRef, opts?: { webhookUrl?: string }): Promise<EvoResult> {
  return evo('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: instance.instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      // Evolution v2.1.1: sem `events`, o webhook não recebe nada. Este servidor NÃO
      // devolve o QR base64 na resposta HTTP do connect — ele chega pelo evento
      // QRCODE_UPDATED. Inscrevemos: QR (parear) + inbound de mensagens + conexão.
      ...(opts?.webhookUrl
        ? { webhook: { url: opts.webhookUrl, byEvents: false, base64: true, events: ['QRCODE_UPDATED', 'MESSAGES_UPSERT', 'CONNECTION_UPDATE'] } }
        : {}),
    }),
  });
}

// Abre a conexão e retorna o QR Code (base64 / pairing code) para parear.
export async function getQrCode(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/connect/${encodeURIComponent(instance.instanceName)}`, { method: 'GET' });
}

// Consulta o estado da conexão e o normaliza para o enum do nosso schema.
export async function getConnectionState(
  instance: InstanceRef,
): Promise<EvoResult & { state?: WhatsAppInstanceStatus }> {
  const res = await evo<any>(`/instance/connectionState/${encodeURIComponent(instance.instanceName)}`, { method: 'GET' });
  const raw = res.data?.instance?.state ?? res.data?.state;
  const map: Record<string, WhatsAppInstanceStatus> = {
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
export async function syncConnectionState(instance: WhatsAppInstance): Promise<WhatsAppInstance> {
  if (!isEvolutionConfigured() || !instance.evolutionInstanceId) return instance;
  const res = await getConnectionState(instance);
  if (!res.ok || !res.state || res.state === instance.status) return instance;
  const data: Record<string, any> = { status: res.state };
  if (res.state === 'CONNECTED') data.lastConnectedAt = new Date();
  if (res.state === 'DISCONNECTED') data.disconnectedAt = new Date();
  try {
    return await prisma.whatsAppInstance.update({ where: { id: instance.id }, data });
  } catch {
    return instance;
  }
}

// Desconecta (logout) a sessão da instância — exige novo QR para reconectar.
export async function logoutInstance(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/logout/${encodeURIComponent(instance.instanceName)}`, { method: 'DELETE' });
}

// Reabre a conexão de uma instância já criada (mesmo endpoint de connect).
export async function reconnectInstance(instance: InstanceRef): Promise<EvoResult> {
  return evo(`/instance/connect/${encodeURIComponent(instance.instanceName)}`, { method: 'GET' });
}

// Envia uma mensagem de texto PELA instância da clínica.
export async function sendMessage(instance: InstanceRef, phone: string, text: string): Promise<EvoResult> {
  return evo(`/message/sendText/${encodeURIComponent(instance.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone.replace(/\D/g, ''), text }),
  });
}

// --- Conveniência para as rotas que só têm o companyId -------------------------

// Envia pela instância PRIMÁRIA da clínica (sem conversa específica — ex.: avisos
// de telemedicina). Se a base não está configurada, a clínica não tem instância,
// ou ela não está CONNECTED, devolve `configured:false` — a rota grava PENDING.
export async function sendWhatsappForCompany(
  companyId: string,
  phone: string,
  text: string,
): Promise<EvoResult> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = await getPrimaryInstance(companyId);
  if (!instance || instance.status !== 'CONNECTED') return { configured: false, ok: false };
  return sendMessage(instance, phone, text);
}

// Envia pela instância vinculada à CONVERSA. Se `instanceId` é null, cai na
// primária da clínica. Retorna também o `instanceId` efetivamente usado, para a
// rota carimbar a mensagem (e vincular a conversa na 1ª saída).
export async function sendWhatsappForConversation(
  conv: { companyId: string; instanceId: string | null },
  phone: string,
  text: string,
): Promise<EvoResult & { instanceId?: string }> {
  if (!isEvolutionConfigured()) return { configured: false, ok: false };
  const instance = conv.instanceId
    ? await prisma.whatsAppInstance.findFirst({ where: { id: conv.instanceId, companyId: conv.companyId } })
    : await getPrimaryInstance(conv.companyId);
  if (!instance || instance.status !== 'CONNECTED') return { configured: false, ok: false };
  const res = await sendMessage(instance, phone, text);
  return { ...res, instanceId: instance.id };
}
