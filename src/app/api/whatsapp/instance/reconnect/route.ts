import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, reconnectInstance, extractQr, instanceSummary, isEvolutionConfigured } from '@/lib/whatsapp/evolution';

// POST /api/whatsapp/instance/reconnect
// Reabre a conexão de uma instância já criada (sessão caída/expirada). Retorna um
// novo QR Code quando a Evolution exigir novo pareamento.
export async function POST() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const instance = await getPrimaryInstance(dbUser!.companyId);
    if (!instance) return NextResponse.json({ error: 'Sem instância para reconectar' }, { status: 404 });
    if (!isEvolutionConfigured() || !instance.evolutionInstanceId) {
      return NextResponse.json({ configured: false, instance: instanceSummary(instance), qrCode: null });
    }

    const conn = await reconnectInstance({ instanceName: instance.instanceName });
    const qr = extractQr(conn.data);
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { qrCode: qr, status: qr ? 'QRCODE' : 'CONNECTING' },
    });
    return NextResponse.json({ configured: true, instance: instanceSummary(updated), qrCode: qr });
  } catch (err) {
    console.error('Erro ao reconectar instância WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
