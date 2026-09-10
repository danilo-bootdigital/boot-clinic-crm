import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { normalizeKeyword } from '@/lib/messaging/quick-replies';
import { pathBelongsToCompany, deleteWhatsappMedia } from '@/lib/storage/messaging-storage';

// `id` presente = anexo já existente (só atualiza legenda/ordem); `path` +
// companheiros presentes = upload novo (acabou de subir via /attachment).
const AttachmentItemSchema = z.object({
  id: z.string().optional(),
  path: z.string().optional(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  sizeBytes: z.number().int().positive().optional(),
  caption: z.string().optional(),
});

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  keyword: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  /**
   * Lista completa (substitui tudo) — quando presente, sincroniza: item com
   * `id` mantém o arquivo e só atualiza legenda/ordem; sem `id` é upload
   * novo; o que existia e não está mais na lista é removido (banco + storage).
   */
  attachments: z.array(AttachmentItemSchema).optional(),
});

// PUT /api/mensageria/quick-replies/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.quickReply.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { attachments: true },
    });
    if (!existing) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    const d = UpdateSchema.parse(await request.json());

    let keyword: string | undefined;
    if (d.keyword !== undefined) {
      keyword = normalizeKeyword(d.keyword);
      if (!keyword) return NextResponse.json({ error: 'Palavra-chave inválida — use letras, números, - ou _' }, { status: 400 });
      if (keyword !== existing.keyword) {
        const dup = await prisma.quickReply.findFirst({
          where: { companyId: dbUser!.companyId, keyword, deletedAt: null, NOT: { id: params.id } },
          select: { id: true },
        });
        if (dup) return NextResponse.json({ error: `Já existe uma mensagem com a palavra-chave "/${keyword}"` }, { status: 400 });
      }
    }

    const existingIds = new Set(existing.attachments.map((a) => a.id));
    if (d.attachments !== undefined) {
      for (const a of d.attachments) {
        if (a.id) {
          if (!existingIds.has(a.id)) return NextResponse.json({ error: 'Anexo inválido' }, { status: 400 });
        } else if (!a.path || !a.mimeType || !a.fileName || !a.sizeBytes) {
          return NextResponse.json({ error: 'Anexo novo incompleto' }, { status: 400 });
        } else if (!pathBelongsToCompany(a.path, dbUser!.companyId)) {
          return NextResponse.json({ error: 'Anexo inválido' }, { status: 400 });
        }
      }
    }

    const novoContent = d.content !== undefined ? (d.content.trim() || null) : existing.content;
    const anexosFinais = d.attachments ?? existing.attachments;
    if (!novoContent && anexosFinais.length === 0) {
      return NextResponse.json({ error: 'Preencha o texto ou anexe uma imagem/PDF' }, { status: 400 });
    }

    if (d.attachments !== undefined) {
      const keepIds = new Set(d.attachments.filter((a) => a.id).map((a) => a.id));
      const remover = existing.attachments.filter((a) => !keepIds.has(a.id));
      // Storage primeiro (best-effort — uma falha aqui não deve travar a
      // atualização), banco depois.
      for (const a of remover) await deleteWhatsappMedia(a.path, dbUser!.companyId).catch(() => {});
      if (remover.length) {
        await prisma.quickReplyAttachment.deleteMany({ where: { id: { in: remover.map((a) => a.id) } } });
      }
      for (let order = 0; order < d.attachments.length; order++) {
        const a = d.attachments[order];
        if (a.id) {
          await prisma.quickReplyAttachment.update({
            where: { id: a.id },
            data: { caption: a.caption?.trim() || null, order },
          });
        } else {
          await prisma.quickReplyAttachment.create({
            data: {
              quickReplyId: params.id,
              companyId: dbUser!.companyId,
              path: a.path!,
              mimeType: a.mimeType!,
              fileName: a.fileName!,
              sizeBytes: a.sizeBytes!,
              caption: a.caption?.trim() || null,
              order,
            },
          });
        }
      }
    }

    const item = await prisma.quickReply.update({
      where: { id: params.id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.content !== undefined && { content: novoContent }),
        ...(keyword !== undefined && { keyword }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
      },
      include: { attachments: { orderBy: { order: 'asc' } } },
    });
    return NextResponse.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos', details: err.errors }, { status: 400 });
    console.error('Erro ao atualizar mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// DELETE /api/mensageria/quick-replies/[id] — soft delete
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const existing = await prisma.quickReply.findFirst({
      where: { id: params.id, companyId: dbUser!.companyId, deletedAt: null },
      include: { attachments: true },
    });
    if (!existing) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 });

    await prisma.quickReply.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    for (const a of existing.attachments) {
      await deleteWhatsappMedia(a.path, dbUser!.companyId).catch(() => {});
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir mensagem pronta:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
