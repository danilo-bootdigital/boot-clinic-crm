// Ponte tipada entre ChannelAccount e a Meta (Instagram Messaging).
//
// Mesmo papel do adapters/whatsapp/account.ts: o núcleo não conhece provedor, e
// este é o ÚNICO módulo que lê/escreve o providerConfig do Instagram.
//
// O token de Página é credencial: fica CIFRADO no providerConfig (secret-box) e
// nunca sai daqui em texto — quem precisa dele chama `pageAccessToken()`.
import { Channel, Prisma } from '@prisma/client';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secret-box';

export interface InstagramProviderConfig {
  /** ID da conta do Instagram (IG User ID) ligada à Página. */
  igUserId?: string | null;
  /** ID da Página do Facebook — a Meta entrega DM de Instagram por ela. */
  pageId?: string | null;
  /** Token de Página CIFRADO. Nunca logar, nunca devolver para o cliente. */
  pageAccessTokenEnc?: string | null;
  /** @ do perfil, para exibição. */
  username?: string | null;
}

interface AccountLike {
  id: string;
  companyId: string;
  providerConfig: Prisma.JsonValue | null;
}

export function igConfig(account: AccountLike): InstagramProviderConfig {
  const raw = (account.providerConfig ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    igUserId: str(raw.igUserId),
    pageId: str(raw.pageId),
    pageAccessTokenEnc: str(raw.pageAccessTokenEnc),
    username: str(raw.username),
  };
}

/** Token em claro para chamar a Graph API. null = não conectado/indecifrável. */
export function pageAccessToken(account: AccountLike): string | null {
  return decryptSecret(igConfig(account).pageAccessTokenEnc);
}

/**
 * Patch parcial do providerConfig. `pageAccessToken` entra em claro e sai
 * cifrado — chamador nunca lida com a cifra.
 */
export function igConfigPatch(
  account: AccountLike,
  patch: Partial<Omit<InstagramProviderConfig, 'pageAccessTokenEnc'>> & { pageAccessToken?: string | null }
): Prisma.InputJsonValue {
  const current = (account.providerConfig ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (key === 'pageAccessToken') continue;
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }

  if ('pageAccessToken' in patch) {
    if (patch.pageAccessToken) next.pageAccessTokenEnc = encryptSecret(patch.pageAccessToken);
    else delete next.pageAccessTokenEnc;
  }

  return next as Prisma.InputJsonValue;
}

/** Filtro da conta Instagram de uma clínica. */
export function instagramAccountWhere(companyId: string) {
  return { companyId, channel: Channel.INSTAGRAM } as const;
}

/** Resumo seguro para a tela — sem token, sem cifra. */
export function igAccountSummary(account: AccountLike & {
  label: string;
  status: string;
  displayName: string | null;
  externalId: string | null;
  lastConnectedAt: Date | null;
}) {
  const cfg = igConfig(account);
  return {
    id: account.id,
    label: account.label,
    status: account.status,
    username: cfg.username,
    igUserId: cfg.igUserId,
    pageId: cfg.pageId,
    displayName: account.displayName,
    lastConnectedAt: account.lastConnectedAt,
    hasToken: Boolean(cfg.pageAccessTokenEnc),
  };
}
