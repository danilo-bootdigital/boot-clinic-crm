import { NextRequest, NextResponse } from 'next/server';
import { Channel, ChannelAccountStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import { igAccountSummary, igConfigPatch } from '@/lib/messaging/adapters/instagram/account';
import { isInstagramConfigured } from '@/lib/messaging/adapters/instagram/graph';
import { isSecretBoxConfigured } from '@/lib/crypto/secret-box';

// GET    /api/mensageria/accounts/instagram — estado da conexão desta clínica
// DELETE /api/mensageria/accounts/instagram — desconecta (apaga o token)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const account = await prisma.channelAccount.findFirst({
      where: { companyId: dbUser!.companyId, channel: Channel.INSTAGRAM },
    });

    return NextResponse.json({
      // A tela precisa distinguir "não configurado pelo sistema" de "não
      // conectado pela clínica": o primeiro ela não resolve sozinha.
      configured: isInstagramConfigured(),
      secretsReady: isSecretBoxConfigured(),
      account: account ? igAccountSummary(account) : null,
    });
  } catch (err) {
    console.error('Erro ao consultar conta do Instagram:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const account = await prisma.channelAccount.findFirst({
      where: { companyId: dbUser!.companyId, channel: Channel.INSTAGRAM },
    });
    if (!account) return NextResponse.json({ error: 'Instagram não conectado' }, { status: 404 });

    // Apaga o token e marca desconectado, mas PRESERVA conversas e mensagens:
    // desconectar um canal não é apagar o histórico de atendimento.
    const updated = await prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        status: ChannelAccountStatus.DISCONNECTED,
        disconnectedAt: new Date(),
        providerConfig: igConfigPatch(account, { pageAccessToken: null }),
      },
    });

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.COMPANY,
      entityId: dbUser!.companyId,
      newValues: { canal: 'INSTAGRAM', acao: 'desconectado', accountId: account.id },
      request,
    });

    return NextResponse.json({ account: igAccountSummary(updated) });
  } catch (err) {
    console.error('Erro ao desconectar o Instagram:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
