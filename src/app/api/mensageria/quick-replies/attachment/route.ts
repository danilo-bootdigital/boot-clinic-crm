import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveModuleUser } from '@/lib/api/session';
import { requirePermission } from '@/lib/api/permissions';
import { uploadQuickReplyMedia } from '@/lib/storage/messaging-storage';
import { normalizeMime } from '@/lib/messaging/media-config';

export const runtime = 'nodejs';

// Escopo desta tela é mais estreito que o de mídia da conversa (que também
// aceita áudio/docx/xlsx/etc.): mensagem pronta só permite imagem ou PDF.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

// POST /api/mensageria/quick-replies/attachment (multipart/form-data: file)
// Upload isolado: a mensagem pronta ainda pode nem existir (tela de criação).
// O `path` devolvido é gravado no QuickReply só quando o formulário é salvo —
// evita subir o arquivo à toa se o usuário cadastrar antes do anexo (ordem
// inversa não existe: sem anexo escolhido, este endpoint nem é chamado).
export async function POST(request: NextRequest) {
  try {
    const { dbUser, error } = await resolveModuleUser('whatsapp');
    if (error) return error;
    const forbidden = requirePermission(dbUser!, 'whatsapp', 'edit');
    if (forbidden) return forbidden;

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo é obrigatório' }, { status: 400 });

    const declaredMime = normalizeMime(file.type || 'application/octet-stream');
    if (!ALLOWED_MIME.has(declaredMime)) {
      return NextResponse.json({ error: 'Só imagem (JPG/PNG/WEBP) ou PDF é permitido nesta mensagem' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadQuickReplyMedia({
      companyId: dbUser!.companyId,
      ownerId: randomUUID(),
      fileName: file.name,
      contentType: declaredMime,
      bytes,
    });

    return NextResponse.json({
      attachmentPath: result.path,
      attachmentMimeType: result.mimeType,
      attachmentFileName: result.originalFileName,
      attachmentSizeBytes: result.sizeBytes,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao enviar o anexo';
    console.error('Erro ao subir anexo de mensagem pronta:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
