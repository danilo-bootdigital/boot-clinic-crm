// Regras de conversão da mensageria para os outros módulos (diretriz §5).
//
// Vive em lib/ e não na rota porque arquivo de rota do Next só pode exportar
// nomes que ele reconhece (GET, POST, dynamic…) — qualquer helper exportado de
// lá quebra o build.
import { Channel, DealSource, MessageEntryPoint } from '@prisma/client';

/**
 * Canal + ponto de entrada → DealSource.
 *
 * A origem do lead NÃO é escolha do usuário: quem chamou no WhatsApp entra como
 * WHATSAPP, quem veio de Instagram/TikTok entra como SOCIAL_MEDIA. Assim o
 * relatório do CRM não depende de alguém lembrar de marcar o select certo.
 *
 * O detalhe da campanha (id do anúncio, story) fica em `Message.referral` — o
 * DealSource é grosso de propósito, para casar com o vocabulário do CRM.
 */
export function dealSourceFor(channel: Channel, _entryPoint?: MessageEntryPoint | null): DealSource {
  if (channel === Channel.WHATSAPP) return DealSource.WHATSAPP;
  if (channel === Channel.INSTAGRAM || channel === Channel.TIKTOK) return DealSource.SOCIAL_MEDIA;
  return DealSource.OTHER;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
};
