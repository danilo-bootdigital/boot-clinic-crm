import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, reconnectInstance, extractQr, instanceSummary, isEvolutionConfigured } from '@/lib/messaging/adapters/whatsapp/evolution';

// POST /api/mensageria/accounts/reconnect
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
    if (!isEvolutionConfigured()) {
      return NextResponse.json({ configured: false, instance: instanceSummary(instance), qrCode: null });
    }
    // Não há instância na Evolution para reconectar (conta recém-criada, ou
    // provedor recriado). O caminho certo é o connect, que cria a instância.
    // Antes isso devolvia configured:false em silêncio e a tela ficava travada.
    if (!waConfig(instance).evolutionInstanceId) {
      return NextResponse.json(
        {
          error: 'Esta conta ainda não tem instância na Evolution. Use "Conectar" para criar e ler o QR Code.',
          needsConnect: true,
          instance: instanceSummary(instance),
        },
        { status: 409 }
      );
    }

    const conn = await reconnectInstance(instance);
    const qr = extractQr(conn.data);
    const updated = await prisma.channelAccount.update({
      where: { id: instance.id },
      data: { providerConfig: waConfigPatch(instance, { qrCode: qr }), status: qr ? 'QRCODE' : 'CONNECTING' },
    });
    return NextResponse.json({ configured: true, instance: instanceSummary(updated), qrCode: qr });
  } catch (err) {
    console.error('Erro ao reconectar instância WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
