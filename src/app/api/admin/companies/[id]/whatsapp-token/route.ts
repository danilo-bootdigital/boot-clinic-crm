import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { resolveDbUser, requireSuperAdmin } from '@/lib/api/session';
import { writeAudit } from '@/lib/api/audit';

// Monta a URL do webhook a partir da origem da requisição (ou env de site).
function webhookUrl(origin: string, token: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || origin;
  return `${base.replace(/\/$/, '')}/api/whatsapp/webhook?token=${token}`;
}

// GET — retorna o token atual da clínica (ou null) + a URL do webhook, se houver.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const company = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null }, select: { whatsappWebhookToken: true } });
    if (!company) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    const token = company.whatsappWebhookToken;
    return NextResponse.json({ token, url: token ? webhookUrl(new URL(request.url).origin, token) : null });
  } catch (err) {
    console.error('Erro ao consultar token WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST — (re)gera o token do webhook WhatsApp da clínica e devolve a URL pronta
// para colar na configuração da instância da Evolution daquela clínica.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requireSuperAdmin(dbUser!);
    if (forbidden) return forbidden;

    const exists = await prisma.company.findFirst({ where: { id: params.id, deletedAt: null }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });

    // Token opaco (sem dependência do payload da Evolution). Prefixo legível.
    const token = `wh_${randomUUID().replace(/-/g, '')}`;
    await prisma.company.update({ where: { id: params.id }, data: { whatsappWebhookToken: token } });

    await writeAudit({
      dbUser: { id: dbUser!.id, name: dbUser!.name, companyId: params.id },
      action: 'UPDATE', entityType: 'COMPANY', entityId: params.id,
      newValues: { whatsappWebhookToken: 'rotacionado' }, request,
    });

    return NextResponse.json({ token, url: webhookUrl(new URL(request.url).origin, token) });
  } catch (err) {
    console.error('Erro ao gerar token WhatsApp:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
