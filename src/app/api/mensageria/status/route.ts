import { waConfig } from '@/lib/messaging/adapters/whatsapp/account';
import { NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { isEvolutionConfigured, getPrimaryInstance, syncConnectionState } from '@/lib/messaging/adapters/whatsapp/evolution';

// GET /api/mensageria/status
// Status real da instância PRIMÁRIA da clínica logada (não mais só a config global).
// Reconcilia o estado com a Evolution (best-effort) antes de responder.
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const configured = isEvolutionConfigured();
    let instance = await getPrimaryInstance(dbUser!.companyId);
    if (instance && configured) instance = await syncConnectionState(instance);

    return NextResponse.json({
      configured,
      hasInstance: !!instance,
      status: instance?.status ?? 'DISCONNECTED',
      channel: instance?.channel ?? null,
      phoneNumber: instance?.externalId ?? null,
      profileName: instance?.displayName ?? null,
      label: instance?.label ?? null,
      lastConnectedAt: instance?.lastConnectedAt ?? null,
      disconnectedAt: instance?.disconnectedAt ?? null,
      // QR atual (preenchido pelo webhook QRCODE_UPDATED). Permite à tela exibir o QR
      // sem uma chamada extra. Não exposto quando já conectado.
      qrCode: instance && instance.status !== 'CONNECTED' ? waConfig(instance).qrCode ?? null : null,
    });
  } catch (err) {
    console.error('Erro no status do WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
