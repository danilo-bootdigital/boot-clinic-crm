import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  instanceWebhookUrl,
  setInstanceWebhook,
  isEvolutionConfigured,
} from '@/lib/whatsapp/evolution';

// POST /api/admin/whatsapp/resync-webhooks
//
// Re-registra na Evolution a URL de webhook de TODAS as instâncias, usando a base
// pública atual (NEXT_PUBLIC_APP_URL). Existe porque a URL fica gravada ABSOLUTA no
// lado da Evolution: quando o domínio do sistema muda, cada instância continua
// apontando para o host antigo e o CRM simplesmente PARA de receber mensagens — sem
// erro, sem log, sem sintoma na tela. Esta rota é o passo de virada de domínio.
//
// Diferente de /api/whatsapp/instance/connect, aqui NÃO se chama /instance/connect:
// só troca a URL do webhook. Nenhuma clínica lê QR novo nem perde a sessão pareada.
//
// Segurança: `Authorization: Bearer <CRON_SECRET>`, fail-closed (sem CRON_SECRET
// definido, ninguém entra). É operação de ops, sem sessão de usuário — por isso não
// grava AuditLog (que exige userId/companyId); o rastro fica no retorno e no console.

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  if (!isEvolutionConfigured()) {
    return NextResponse.json({ error: 'Evolution não configurada' }, { status: 503 });
  }

  try {
    const origin = new URL(request.url).origin;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, '');

    // Só instâncias que já existem na Evolution e têm token. As demais recebem a URL
    // correta no primeiro connect, então não há nada a re-registrar nelas.
    const instances = await prisma.whatsAppInstance.findMany({
      where: { evolutionInstanceId: { not: null }, webhookToken: { not: null } },
      select: { instanceName: true, companyId: true, webhookToken: true },
    });

    const results: Array<{ instanceName: string; companyId: string; ok: boolean; error?: string }> = [];

    // Sequencial de propósito: são poucas instâncias e um burst de chamadas na
    // Evolution durante uma janela de virada não compensa o risco de rate limit.
    for (const instance of instances) {
      // A URL carrega o token da instância — nunca logar/retornar a URL montada.
      const webhookUrl = instanceWebhookUrl(baseUrl, instance.webhookToken!);
      try {
        const res = await setInstanceWebhook({ instanceName: instance.instanceName }, webhookUrl);
        results.push({
          instanceName: instance.instanceName,
          companyId: instance.companyId,
          ok: res.ok,
          ...(res.ok ? {} : { error: res.error }),
        });
        if (!res.ok) {
          console.warn('[resync-webhooks] Evolution recusou:', instance.instanceName, res.error);
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        results.push({ instanceName: instance.instanceName, companyId: instance.companyId, ok: false, error });
        console.warn('[resync-webhooks] erro ao re-registrar:', instance.instanceName, error);
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
