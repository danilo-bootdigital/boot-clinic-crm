import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { normalizeKeyword } from '@/lib/messaging/quick-replies';
import { pathBelongsToCompany } from '@/lib/storage/messaging-storage';

const DEFAULTS = [
  { title: 'Saudação', content: 'Olá! Aqui é da clínica. Como podemos ajudar?', keyword: 'saudacao' },
  { title: 'Confirmação', content: 'Confirmando sua consulta. Podemos manter o horário?', keyword: 'confirmacao' },
  { title: 'Lembrete', content: 'Lembrete: sua consulta está agendada. Até breve!', keyword: 'lembrete' },
];

const AttachmentItemSchema = z.object({
  path: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  caption: z.string().optional(),
});

// `content` é opcional no schema: mensagem pode ser só os anexos. O `.refine`
// abaixo é quem garante que não sobra uma mensagem sem texto E sem anexo.
const Schema = z
  .object({
    title: z.string().min(1),
    content: z.string().optional(),
    keyword: z.string().min(1, 'Palavra-chave é obrigatória'),
    attachments: z.array(AttachmentItemSchema).optional(),
  })
  .refine((d) => !!(d.content?.trim() || d.attachments?.length), {
    message: 'Preencha o texto ou anexe uma imagem/PDF',
    path: ['content'],
  });

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
      include: { attachments: { orderBy: { order: 'asc' } } },
    });
    // Compat: o componente usa `message` e/ou `content`. `path` nunca sai
    // daqui — só nome/tipo/tamanho/legenda; os bytes vêm pela rota dedicada.
    return NextResponse.json(items.map((q) => ({
      id: q.id, title: q.title, content: q.content, message: q.content, keyword: q.keyword, isActive: q.isActive,
      hasAttachment: q.attachments.length > 0,
      attachments: q.attachments.map((a) => ({
        id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, caption: a.caption,
      })),
    })));
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

    for (const a of d.attachments ?? []) {
      if (!pathBelongsToCompany(a.path, dbUser!.companyId)) {
        return NextResponse.json({ error: 'Anexo inválido' }, { status: 400 });
      }
    }

    const item = await prisma.quickReply.create({
      data: {
        title: d.title,
        content: d.content?.trim() || null,
        keyword,
        companyId: dbUser!.companyId,
        attachments: {
          create: (d.attachments ?? []).map((a, order) => ({
            companyId: dbUser!.companyId,
            path: a.path,
            mimeType: a.mimeType,
            fileName: a.fileName,
            sizeBytes: a.sizeBytes,
            caption: a.caption?.trim() || null,
            order,
          })),
        },
      },
      include: { attachments: true },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao criar resposta rápida:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
