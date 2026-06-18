import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';

const DEFAULTS = [
  { title: 'Saudação', content: 'Olá! Aqui é da clínica. Como podemos ajudar?' },
  { title: 'Confirmação', content: 'Confirmando sua consulta. Podemos manter o horário?' },
  { title: 'Lembrete', content: 'Lembrete: sua consulta está agendada. Até breve!' },
];

const Schema = z.object({ title: z.string().min(1), content: z.string().min(1) });

// GET /api/whatsapp/quick-replies (cria padrões na 1ª vez)
export async function GET() {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const count = await prisma.whatsAppQuickReply.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.whatsAppQuickReply.createMany({ data: DEFAULTS.map((q) => ({ ...q, companyId: dbUser!.companyId })) });
    }

    const items = await prisma.whatsAppQuickReply.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null, isActive: true },
      orderBy: { title: 'asc' },
    });
    // Compat: o componente usa `message` e/ou `content`.
    return NextResponse.json(items.map((q) => ({ id: q.id, title: q.title, content: q.content, message: q.content, isActive: q.isActive })));
  } catch (err) {
    console.error('Erro ao listar respostas rápidas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/whatsapp/quick-replies
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const d = Schema.parse(await request.json());
    const item = await prisma.whatsAppQuickReply.create({ data: { title: d.title, content: d.content, companyId: dbUser!.companyId } });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar resposta rápida:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
