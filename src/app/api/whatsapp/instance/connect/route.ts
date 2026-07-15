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
} from '@/lib/whatsapp/evolution';

// POST /api/whatsapp/instance/connect
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

    if (!instance.evolutionInstanceId) {
      // 1ª vez: cria a instância na Evolution (QR habilitado + webhook próprio).
      const created = await createInstance({ instanceName: instance.instanceName }, { webhookUrl });
      if (!created.ok) {
        return NextResponse.json({ error: 'Falha ao criar instância na Evolution', detail: created.error }, { status: 502 });
      }
      const evoId = (created.data as any)?.instance?.instanceId ?? instance.instanceName;
      qr = extractQr(created.data);
      instance = await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { evolutionInstanceId: evoId, qrCode: qr, status: qr ? 'QRCODE' : 'CONNECTING' },
      });
    } else {
      // Já criada: refresca os eventos do webhook (p/ instâncias antigas passarem a
      // receber MESSAGES_UPDATE) e pede um QR novo (reabre a conexão).
      await setInstanceWebhook({ instanceName: instance.instanceName }, webhookUrl).catch(() => {});
      const conn = await getQrCode({ instanceName: instance.instanceName });
      qr = extractQr(conn.data);
      instance = await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { qrCode: qr, status: qr ? 'QRCODE' : 'CONNECTING' },
      });
    }

    return NextResponse.json({ configured: true, instance: instanceSummary(instance), qrCode: qr });
  } catch (err) {
    console.error('Erro ao conectar instância WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
