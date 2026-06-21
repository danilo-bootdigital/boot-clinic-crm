import { NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { isEvolutionConfigured, getPrimaryInstance, syncConnectionState } from '@/lib/whatsapp/evolution';

// GET /api/whatsapp/status
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
      phoneNumber: instance?.phoneNumber ?? null,
      profileName: instance?.profileName ?? null,
      label: instance?.label ?? null,
      lastConnectedAt: instance?.lastConnectedAt ?? null,
      disconnectedAt: instance?.disconnectedAt ?? null,
    });
  } catch (err) {
    console.error('Erro no status do WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
