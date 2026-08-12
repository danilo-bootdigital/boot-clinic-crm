// Ponte tipada entre ChannelAccount e a Evolution API.
//
// O núcleo da mensageria não conhece provedor (diretriz regra 2), então os
// campos específicos da Evolution vivem em `ChannelAccount.providerConfig`
// (Json). Este módulo é o ÚNICO lugar que lê/escreve esse Json — o resto do
// adapter trabalha com um objeto tipado, sem `as any` espalhado.
import { Channel, Prisma } from '@prisma/client';

export interface WhatsAppProviderConfig {
  /** Nome da instância na Evolution (ex.: clinic_<companyId>). */
  instanceName: string;
  /** Id retornado pela Evolution ao criar a instância. */
  evolutionInstanceId?: string | null;
  /** QR Code em base64 — transitório, só durante o pareamento. */
  qrCode?: string | null;
}

/** Nome determinístico da instância a partir da clínica. */
export function instanceNameFor(companyId: string): string {
  return `clinic_${companyId}`;
}

interface AccountLike {
  id: string;
  companyId: string;
  providerConfig: Prisma.JsonValue | null;
}

/**
 * Lê a config do provedor. `instanceName` nunca volta vazio: cai no nome
 * determinístico da clínica, que é como as instâncias sempre foram criadas.
 */
export function waConfig(account: AccountLike): WhatsAppProviderConfig {
  const raw = (account.providerConfig ?? {}) as Record<string, unknown>;
  const instanceName =
    typeof raw.instanceName === 'string' && raw.instanceName
      ? raw.instanceName
      : instanceNameFor(account.companyId);
  return {
    instanceName,
    evolutionInstanceId: typeof raw.evolutionInstanceId === 'string' ? raw.evolutionInstanceId : null,
    qrCode: typeof raw.qrCode === 'string' ? raw.qrCode : null,
  };
}

/**
 * Monta o Json de update mesclando com o que já está gravado — patch parcial
 * sem apagar as outras chaves. Passar `null` num campo o remove.
 */
export function waConfigPatch(
  account: AccountLike,
  patch: Partial<WhatsAppProviderConfig>
): Prisma.InputJsonValue {
  const current = (account.providerConfig ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  if (!next.instanceName) next.instanceName = instanceNameFor(account.companyId);
  return next as Prisma.InputJsonValue;
}

/** Filtro para localizar a conta WhatsApp de uma clínica. */
export function whatsappAccountWhere(companyId: string) {
  return { companyId, channel: Channel.WHATSAPP, isPrimary: true } as const;
}
