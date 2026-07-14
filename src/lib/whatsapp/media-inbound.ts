import { prisma } from '@/lib/db/prisma';
import { getMediaBase64 } from '@/lib/whatsapp/evolution';
import { uploadWhatsappMedia } from '@/lib/storage/whatsapp-storage';
import { categoryForMime, extensionForMime, hasPathTraversal } from '@/lib/whatsapp/media-config';

// Baixa a mídia de uma mensagem recebida (sob demanda, via Evolution), valida,
// armazena no bucket privado e cria o WhatsAppAttachment; então marca a mensagem
// como AVAILABLE. Em qualquer falha → mediaStatus=FAILED (a mensagem NÃO some) com
// erro sanitizado. Idempotente: se já houver anexo p/ a mensagem, não duplica.
// NUNCA loga base64/conteúdo.
export type InboundMediaResult = 'available' | 'failed' | 'duplicate';

function sanitizeErr(e: unknown): string {
  const m = e instanceof Error ? e.message : 'erro';
  return String(m).replace(/[A-Za-z0-9+/]{120,}={0,2}/g, '[base64]').slice(0, 200); // remove blobs base64
}

export async function downloadAndStoreInboundMedia(opts: {
  instance: { instanceName: string };
  rawMessage: any;
  message: { id: string; companyId: string; conversationId: string };
}): Promise<InboundMediaResult> {
  const { message } = opts;

  // Idempotência: anexo já existente (reprocessamento) → não baixa/duplica.
  const already = await prisma.whatsAppAttachment.findFirst({ where: { messageId: message.id, deletedAt: null }, select: { id: true } });
  if (already) return 'duplicate';

  const markFailed = async (reason: string) => {
    await prisma.whatsAppMessage.update({ where: { id: message.id }, data: { mediaStatus: 'FAILED', errorMessage: reason.slice(0, 200) } }).catch(() => {});
    return 'failed' as const;
  };

  let res;
  try {
    res = await getMediaBase64(opts.instance, opts.rawMessage);
  } catch (e) {
    return markFailed(sanitizeErr(e));
  }
  if (!res.ok || !res.base64) return markFailed('download da mídia indisponível');

  const mime = res.mimetype || '';
  const category = categoryForMime(mime);
  const ext = extensionForMime(mime);
  if (!category || !ext) return markFailed(`tipo de mídia não suportado: ${mime || 'desconhecido'}`);

  let fileName = res.fileName && !hasPathTraversal(res.fileName) ? res.fileName : `midia.${ext}`;
  if (!fileName.toLowerCase().endsWith(`.${ext}`)) fileName = `midia.${ext}`;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(res.base64, 'base64'));
  } catch {
    return markFailed('falha ao decodificar mídia');
  }
  if (bytes.length === 0) return markFailed('mídia vazia');

  try {
    const up = await uploadWhatsappMedia({
      companyId: message.companyId,
      conversationId: message.conversationId,
      messageId: message.id,
      fileName,
      contentType: mime,
      bytes,
    });
    await prisma.whatsAppAttachment.create({
      data: {
        companyId: message.companyId, // derivado da mensagem (não do cliente)
        messageId: message.id,
        storagePath: up.path,
        mimeType: up.mimeType,
        sizeBytes: up.sizeBytes,
        checksum: up.checksum ?? null,
        originalFileName: up.originalFileName,
      },
    });
    await prisma.whatsAppMessage.update({ where: { id: message.id }, data: { mediaStatus: 'AVAILABLE' } });
    return 'available';
  } catch (e) {
    return markFailed(sanitizeErr(e));
  }
}
