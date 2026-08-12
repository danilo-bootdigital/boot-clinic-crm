import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, getQrCode, extractQr, isEvolutionConfigured } from '@/lib/messaging/adapters/whatsapp/evolution';

// GET /api/mensageria/accounts/qrcode
// Retorna um QR Code atual para parear a instância primária da clínica logada.
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const instance = await getPrimaryInstance(dbUser!.companyId);
    if (!instance) return NextResponse.json({ hasInstance: false, qrCode: null });
    if (!isEvolutionConfigured() || !waConfig(instance).evolutionInstanceId) {
      return NextResponse.json({ hasInstance: true, configured: false, status: instance.status, qrCode: null });
    }

    // Dispara a geração do QR. Alguns servidores devolvem o base64 aqui; outros
    // (como este) entregam via webhook QRCODE_UPDATED — daí o fallback ao valor já
    // salvo na instância pelo webhook.
    const conn = await getQrCode(instance);
    const qr = extractQr(conn.data) ?? waConfig(instance).qrCode;
    if (qr && qr !== waConfig(instance).qrCode && instance.status !== 'CONNECTED') {
      await prisma.channelAccount.update({ where: { id: instance.id }, data: { providerConfig: waConfigPatch(instance, { qrCode: qr }), status: 'QRCODE' } });
    }
    return NextResponse.json({ hasInstance: true, configured: true, status: qr ? 'QRCODE' : instance.status, qrCode: qr });
  } catch (err) {
    console.error('Erro ao gerar QR Code WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
