import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { getPrimaryInstance, logoutInstance, instanceSummary, isEvolutionConfigured } from '@/lib/whatsapp/evolution';

// POST /api/whatsapp/instance/logout
// Desconecta (logout) a sessão da instância primária da clínica logada.
export async function POST() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const instance = await getPrimaryInstance(dbUser!.companyId);
    if (!instance) return NextResponse.json({ error: 'Sem instância para desconectar' }, { status: 404 });

    if (isEvolutionConfigured() && instance.evolutionInstanceId) {
      await logoutInstance({ instanceName: instance.instanceName });
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date(), qrCode: null },
    });
    return NextResponse.json({ instance: instanceSummary(updated) });
  } catch (err) {
    console.error('Erro ao desconectar instância WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
