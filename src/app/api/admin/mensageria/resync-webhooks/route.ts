import { Channel } from '@prisma/client';
import { waConfig, waConfigPatch } from '@/lib/messaging/adapters/whatsapp/account';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import {
  instanceWebhookUrl,
  setInstanceWebhook,
  isEvolutionConfigured,
} from '@/lib/messaging/adapters/whatsapp/evolution';

// POST /api/admin/whatsapp/resync-webhooks
//
// Re-registra na Evolution a URL de webhook de TODAS as instâncias, usando a base
// pública atual (NEXT_PUBLIC_APP_URL). Existe porque a URL fica gravada ABSOLUTA no
// lado da Evolution: quando o domínio do sistema muda, cada instância continua
// apontando para o host antigo e o CRM simplesmente PARA de receber mensagens — sem
// erro, sem log, sem sintoma na tela. Esta rota é o passo de virada de domínio.
//
// Diferente de /api/mensageria/accounts/connect, aqui NÃO se chama /instance/connect:
// só troca a URL do webhook. Nenhuma clínica lê QR novo nem perde a sessão pareada.
//
// Segurança — dois caminhos, ambos fail-closed:
//   1. sessão de SUPER_ADMIN (é assim que o botão do painel /admin chama);
//   2. `Authorization: Bearer <CRON_SECRET>`, para ops/script sem navegador.
// O Bearer é verificado primeiro: numa chamada de ops não há cookie de sessão.
// Não grava AuditLog porque o caminho 2 não tem userId/companyId; o rastro fica no
// retorno da chamada e no console.

export const dynamic = 'force-dynamic';

function hasOpsSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Devolve null quando autorizado, ou a NextResponse de recusa.
async function authorize(request: NextRequest): Promise<NextResponse | null> {
  if (hasOpsSecret(request)) return null;
  const { dbUser, error } = await resolveDbUser();
  if (error) return error;
  const forbidden = requireSuperAdmin(dbUser!);
  if (forbidden) return forbidden;
  return null;
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  if (!isEvolutionConfigured()) {
    return NextResponse.json({ error: 'Evolution não configurada' }, { status: 503 });
  }

  try {
    const origin = new URL(request.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');

    // Só instâncias que já existem na Evolution e têm token. As demais recebem a URL
    // correta no primeiro connect, então não há nada a re-registrar nelas.
    // `evolutionInstanceId` vive no providerConfig, que não é filtrável de forma
    // confiável no Postgres via Prisma para "chave existe e não é null". Traz as
    // contas WhatsApp com token e filtra em memória — são poucas por definição.
    const candidates = await prisma.channelAccount.findMany({
      where: { channel: Channel.WHATSAPP, webhookToken: { not: null } },
      select: { id: true, companyId: true, webhookToken: true, providerConfig: true },
    });
    const instances = candidates.filter((account) => waConfig(account).evolutionInstanceId);

    const results: Array<{ instanceName: string; companyId: string; ok: boolean; error?: string }> = [];

    // Sequencial de propósito: são poucas instâncias e um burst de chamadas na
    // Evolution durante uma janela de virada não compensa o risco de rate limit.
    for (const instance of instances) {
      // A URL carrega o token da instância — nunca logar/retornar a URL montada.
      const webhookUrl = instanceWebhookUrl(baseUrl, instance.webhookToken!);
      try {
        const res = await setInstanceWebhook(instance, webhookUrl);
        results.push({
          instanceName: waConfig(instance).instanceName,
          companyId: instance.companyId,
          ok: res.ok,
          ...(res.ok ? {} : { error: res.error }),
        });
        if (!res.ok) {
          console.warn('[resync-webhooks] Evolution recusou:', waConfig(instance).instanceName, res.error);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        results.push({ instanceName: waConfig(instance).instanceName, companyId: instance.companyId, ok: false, error });
        console.warn('[resync-webhooks] erro ao re-registrar:', waConfig(instance).instanceName, error);
      }
    }

    const ok = results.filter((r) => r.ok).length;
    console.log(`[resync-webhooks] ${ok}/${results.length} instâncias apontadas para ${baseUrl}`);

    return NextResponse.json({
      baseUrl,
      total: results.length,
      ok,
      failed: results.length - ok,
      results,
    });
  } catch (err) {
    console.error('Erro ao re-registrar webhooks WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
