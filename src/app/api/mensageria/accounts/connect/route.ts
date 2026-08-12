import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import {
  ensurePrimaryInstance,
  instanceWebhookUrl,
  instanceSummary,
  createInstance,
  setInstanceWebhook,
  getQrCode,
  extractQr,
  isEvolutionConfigured,
  WEBHOOK_EVENTS_VERSION,
} from '@/lib/messaging/adapters/whatsapp/evolution';

// POST /api/mensageria/accounts/connect
// Inicia a conexão da instância PRIMÁRIA da clínica logada:
//  - cria o registro "Principal" se a clínica ainda não tiver instância;
//  - cria a instância na Evolution na 1ª vez (com o webhook desta instância);
//  - retorna o QR Code (base64) para parear.
// A instância é SEMPRE resolvida pela clínica da sessão — nunca por id do cliente,
// então uma clínica não acessa a instância de outra.
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    let instance = await ensurePrimaryInstance(dbUser!.companyId);

    // Sem Evolution configurada: devolve o registro (pronto-para-conectar), sem QR.
    if (!isEvolutionConfigured()) {
      return NextResponse.json({ configured: false, instance: instanceSummary(instance), qrCode: null });
    }

    const origin = new URL(request.url).origin;
    const webhookUrl = instanceWebhookUrl(origin, instance.webhookToken!);
    let qr: string | null = null;

    if (!waConfig(instance).evolutionInstanceId) {
      // 1ª vez: cria a instância na Evolution (QR habilitado + webhook próprio).
      const created = await createInstance(instance, { webhookUrl });
      if (!created.ok) {
        return NextResponse.json({ error: 'Falha ao criar instância na Evolution', detail: created.error }, { status: 502 });
      }
      const evoId = (created.data as any)?.instance?.instanceId ?? waConfig(instance).instanceName;
      qr = extractQr(created.data);
      // createInstance já registra os WEBHOOK_EVENTS atuais → grava a versão p/ nunca
      // re-registrar essa instância recém-criada nos próximos reconnects.
      instance = await prisma.channelAccount.update({
        where: { id: instance.id },
        data: {
          providerConfig: waConfigPatch(instance, { evolutionInstanceId: evoId, qrCode: qr }),
          status: qr ? 'QRCODE' : 'CONNECTING',
          providerEventsVersion: WEBHOOK_EVENTS_VERSION,
        },
      });
    } else {
      // Já criada: re-registra os eventos do webhook UMA VEZ POR VERSÃO (p/ instâncias
      // antigas passarem a receber MESSAGES_UPDATE), depois pede um QR novo (reabre a
      // conexão). O gate por providerEventsVersion evita repetir a chamada HTTP em todo
      // reconnect — só roda quando a instância está defasada.
      const needsWebhookSync = instance.providerEventsVersion < WEBHOOK_EVENTS_VERSION;
      let webhookSynced = !needsWebhookSync;
      if (needsWebhookSync) {
        // Best-effort (não bloqueia o QR), mas o erro é LOGADO: se a re-registração
        // falhar, a instância não passa a receber MESSAGES_UPDATE e os ticks ficam
        // presos — sem log isso é invisível. Só marca sincronizada (e persiste a versão)
        // quando a Evolution confirma, então uma falha é reprocessada no próximo reconnect.
        try {
          const res = await setInstanceWebhook(instance, webhookUrl);
          if (res.ok) webhookSynced = true;
          else console.warn('Falha ao refrescar webhook da instância WhatsApp (tentará de novo no próximo reconnect):', waConfig(instance).instanceName, res.error);
        } catch (e) {
          console.warn('Erro ao refrescar webhook da instância WhatsApp:', waConfig(instance).instanceName, e);
        }
      }
      const conn = await getQrCode(instance);
      qr = extractQr(conn.data);
      instance = await prisma.channelAccount.update({
        where: { id: instance.id },
        data: {
          providerConfig: waConfigPatch(instance, { qrCode: qr }),
          status: qr ? 'QRCODE' : 'CONNECTING',
          ...(needsWebhookSync && webhookSynced ? { providerEventsVersion: WEBHOOK_EVENTS_VERSION } : {}),
        },
      });
    }

    return NextResponse.json({ configured: true, instance: instanceSummary(instance), qrCode: qr });
  } catch (err) {
    console.error('Erro ao conectar instância WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
