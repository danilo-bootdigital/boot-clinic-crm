import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Channel, ChannelAccountStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { writeAudit, ActionType, EntityType } from '@/lib/api/audit';
import {
  exchangeCodeForUserToken,
  listPagesWithInstagram,
  subscribePageToWebhook,
} from '@/lib/messaging/adapters/instagram/graph';
import { igConfigPatch } from '@/lib/messaging/adapters/instagram/account';
import { callbackUrl } from '../connect/route';

// GET /api/mensageria/accounts/instagram/callback?code=...&state=...
//
// Volta da Meta depois da autorização. Aqui o `code` é trocado por token de
// usuário, dele saem as Páginas com Instagram vinculado, e o token de PÁGINA é
// guardado CIFRADO no ChannelAccount. A senha da clínica nunca passa por aqui.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_STATE_AGE_MS = 15 * 60 * 1000;

function verifyState(state: string | null, companyId: string): boolean {
  if (!state) return false;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [stateCompanyId, userId, issuedAt, sig] = parts;
    if (stateCompanyId !== companyId) return false;
    if (Date.now() - Number(issuedAt) > MAX_STATE_AGE_MS) return false;

    const expected = createHmac('sha256', process.env.META_APP_SECRET || '')
      .update(`${stateCompanyId}:${userId}:${issuedAt}`)
      .digest('hex')
      .slice(0, 32);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function redirectToSettings(request: NextRequest, params: Record<string, string>) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const url = new URL('/configuracoes', base.replace(/\/$/, ''));
  url.searchParams.set('tab', 'instagram');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (denied) return denied;

    const p = request.nextUrl.searchParams;

    // Usuário recusou no diálogo da Meta.
    if (p.get('error')) {
      return redirectToSettings(request, { ig_error: 'autorizacao_recusada' });
    }

    if (!verifyState(p.get('state'), dbUser!.companyId)) {
      return redirectToSettings(request, { ig_error: 'state_invalido' });
    }

    const code = p.get('code');
    if (!code) return redirectToSettings(request, { ig_error: 'code_ausente' });

    const origin = new URL(request.url).origin;
    const userToken = await exchangeCodeForUserToken(code, callbackUrl(origin));
    if (!userToken.ok || !userToken.data?.access_token) {
      return redirectToSettings(request, { ig_error: 'troca_de_token_falhou' });
    }

    const pages = await listPagesWithInstagram(userToken.data.access_token);
    if (!pages.ok) return redirectToSettings(request, { ig_error: 'paginas_indisponiveis' });

    // Só serve Página COM conta profissional de Instagram vinculada — é o
    // pré-requisito da Meta para DM por API.
    const page = (pages.data?.data || []).find((item) => item.instagram_business_account?.id);
    if (!page || !page.instagram_business_account) {
      return redirectToSettings(request, { ig_error: 'sem_instagram_profissional' });
    }

    const ig = page.instagram_business_account;

    // Uma conta Instagram por clínica (isPrimary). Reconectar atualiza a que existe.
    const existing = await prisma.channelAccount.findFirst({
      where: { companyId: dbUser!.companyId, channel: Channel.INSTAGRAM },
    });

    const shared = {
      // `externalId` é o IGSID da clínica: é por ele que o webhook descobre de
      // quem é a mensagem que chegou.
      externalId: ig.id,
      displayName: ig.name ?? page.name,
      avatarUrl: ig.profile_picture_url ?? null,
      status: ChannelAccountStatus.CONNECTED,
      lastConnectedAt: new Date(),
      disconnectedAt: null,
    };

    const account = existing
      ? await prisma.channelAccount.update({
          where: { id: existing.id },
          data: {
            ...shared,
            providerConfig: igConfigPatch(existing, {
              igUserId: ig.id,
              pageId: page.id,
              username: ig.username ?? null,
              pageAccessToken: page.access_token,
            }),
          },
        })
      : await prisma.channelAccount.create({
          data: {
            companyId: dbUser!.companyId,
            channel: Channel.INSTAGRAM,
            label: 'Instagram',
            isPrimary: true,
            ...shared,
            providerConfig: igConfigPatch(
              { id: 'novo', companyId: dbUser!.companyId, providerConfig: null },
              {
                igUserId: ig.id,
                pageId: page.id,
                username: ig.username ?? null,
                pageAccessToken: page.access_token,
              }
            ),
          },
        });

    // Assina o webhook desta Página. Sem isso a autorização existe mas nenhuma
    // mensagem chega — o pior dos estados, porque parece conectado.
    const sub = await subscribePageToWebhook(page.id, page.access_token);

    await writeAudit({
      dbUser: dbUser!,
      action: ActionType.UPDATE,
      entityType: EntityType.COMPANY,
      entityId: dbUser!.companyId,
      newValues: {
        canal: 'INSTAGRAM',
        accountId: account.id,
        igUsername: ig.username ?? null,
        webhookAssinado: sub.ok,
      },
      request,
    });

    return redirectToSettings(
      request,
      sub.ok ? { ig_ok: '1' } : { ig_error: 'webhook_nao_assinado' }
    );
  } catch (err) {
    console.error('Erro no callback do Instagram:', err);
    return redirectToSettings(request, { ig_error: 'erro_interno' });
  }
}
