import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { normalizeKeyword } from '@/lib/messaging/quick-replies';

const DEFAULTS = [
  { title: 'Saudação', content: 'Olá! Aqui é da clínica. Como podemos ajudar?', keyword: 'saudacao' },
  { title: 'Confirmação', content: 'Confirmando sua consulta. Podemos manter o horário?', keyword: 'confirmacao' },
  { title: 'Lembrete', content: 'Lembrete: sua consulta está agendada. Até breve!', keyword: 'lembrete' },
];

const Schema = z.object({ title: z.string().min(1), content: z.string().min(1), keyword: z.string().min(1, 'Palavra-chave é obrigatória') });

// GET /api/mensageria/quick-replies (cria padrões na 1ª vez)
// ?all=1 traz também as inativas — usado pela página de cadastro; o composer
// da conversa (sem o parâmetro) só quer as que pode oferecer para envio.
export async function GET(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const denied = requirePermission(dbUser!, 'whatsapp', 'view');
    if (denied) return denied;

    const count = await prisma.quickReply.count({ where: { companyId: dbUser!.companyId, deletedAt: null } });
    if (count === 0) {
      await prisma.quickReply.createMany({ data: DEFAULTS.map((q) => ({ ...q, companyId: dbUser!.companyId })) });
    }

    const all = request.nextUrl.searchParams.get('all') === '1';
    const items = await prisma.quickReply.findMany({
      where: { companyId: dbUser!.companyId, deletedAt: null, ...(all ? {} : { isActive: true }) },
      orderBy: { title: 'asc' },
    });
    // Compat: o componente usa `message` e/ou `content`.
    return NextResponse.json(items.map((q) => ({ id: q.id, title: q.title, content: q.content, message: q.content, keyword: q.keyword, isActive: q.isActive })));
  } catch (err) {
    console.error('Erro ao listar respostas rápidas:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// POST /api/mensageria/quick-replies
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const d = Schema.parse(await request.json());
    const keyword = normalizeKeyword(d.keyword);
    if (!keyword) return NextResponse.json({ error: 'Palavra-chave inválida — use letras, números, - ou _' }, { status: 400 });

    const dup = await prisma.quickReply.findFirst({
      where: { companyId: dbUser!.companyId, keyword, deletedAt: null },
      select: { id: true },
    });
    if (dup) return NextResponse.json({ error: `Já existe uma mensagem com a palavra-chave "/${keyword}"` }, { status: 400 });

    const item = await prisma.quickReply.create({ data: { title: d.title, content: d.content, keyword, companyId: dbUser!.companyId } });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar resposta rápida:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
