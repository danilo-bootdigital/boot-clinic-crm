import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveDbUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const Schema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  appointmentReminders: z.boolean().optional(),
  followUpReminders: z.boolean().optional(),
});

// Garante (e devolve) as preferências da empresa, criando os padrões na 1ª vez.
async function ensureSettings(companyId: string) {
  const existing = await prisma.notificationSetting.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.notificationSetting.create({ data: { companyId } });
}

// GET /api/notifications/settings
export async function GET() {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    return NextResponse.json(await ensureSettings(dbUser!.companyId));
  } catch (err) {
    console.error('Erro ao buscar preferências:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT /api/notifications/settings (somente gestão)
export async function PUT(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveDbUser();
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'configuracoes', 'edit');
    if (forbidden) return forbidden;

    await ensureSettings(dbUser!.companyId);
    const d = Schema.parse(await request.json());
    const settings = await prisma.notificationSetting.update({
      where: { companyId: dbUser!.companyId },
      data: d,
    });
    return NextResponse.json(settings);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao salvar preferências:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
