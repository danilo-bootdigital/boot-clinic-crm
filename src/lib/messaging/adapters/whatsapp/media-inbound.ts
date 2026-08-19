import { prisma } from '@/lib/db/prisma';
import { getMediaBase64 } from '@/lib/messaging/adapters/whatsapp/evolution';
import { extractMediaMeta, type InboundMediaMeta } from '@/lib/messaging/adapters/whatsapp/classify';
import { uploadMessagingMedia } from '@/lib/storage/messaging-storage';
import { categoryForMime, extensionForMime, hasPathTraversal, normalizeMime } from '@/lib/messaging/media-config';

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

// Compara os bytes baixados com o que o WhatsApp declarou no payload. Divergência
// significa download incompleto no provedor — e áudio incompleto é o sintoma de
// "toca alguns segundos e para". Retorna a nota de diagnóstico ou null.
// NUNCA loga conteúdo: só tamanhos e o id da mensagem.
function integrityNote(meta: InboundMediaMeta, storedBytes: number, checksumHex: string | undefined): string | null {
  if (!meta.declaredBytes) return null;
  // Tolerância mínima: alguns provedores reempacotam o container e mudam poucos
  // bytes de cabeçalho. Diferença acima disso é perda real de conteúdo.
  const diff = meta.declaredBytes - storedBytes;
  if (Math.abs(diff) <= 64) return null;
  const pct = Math.round((storedBytes / meta.declaredBytes) * 100);
  const sha = checksumHex && meta.sha256Base64
    ? ` sha256Confere=${Buffer.from(meta.sha256Base64, 'base64').toString('hex') === checksumHex}`
    : '';
  return `mídia divergente do declarado: ${storedBytes} de ${meta.declaredBytes} bytes (${pct}%)${sha}`;
}

export async function downloadAndStoreInboundMedia(opts: {
  instance: { id: string; companyId: string; providerConfig: unknown };
  rawMessage: any;
  message: { id: string; companyId: string; conversationId: string };
}): Promise<InboundMediaResult> {
  const { message } = opts;

  // Idempotência: anexo já existente (reprocessamento) → não baixa/duplica.
  const already = await prisma.messageAttachment.findFirst({ where: { messageId: message.id, deletedAt: null }, select: { id: true } });
  if (already) return 'duplicate';

  const markFailed = async (reason: string) => {
    await prisma.message.update({ where: { id: message.id }, data: { mediaStatus: 'FAILED', errorMessage: reason.slice(0, 200) } }).catch(() => {});
    return 'failed' as const;
  };

  let res;
  try {
    res = await getMediaBase64(opts.instance, opts.rawMessage);
  } catch (e) {
    return markFailed(sanitizeErr(e));
  }
  if (!res.ok || !res.base64) return markFailed('download da mídia indisponível');

  // Normaliza o MIME do provedor (ex.: "audio/ogg; codecs=opus" → "audio/ogg", "audio/wave" → "audio/wav").
  const mime = normalizeMime(res.mimetype || '');
  const category = categoryForMime(mime);
  const ext = extensionForMime(mime);
  if (!category || !ext) return markFailed(`tipo de mídia não suportado: ${res.mimetype || 'desconhecido'}`);

  let fileName = res.fileName && !hasPathTraversal(res.fileName) ? res.fileName : `midia.${ext}`;
  if (!fileName.toLowerCase().endsWith(`.${ext}`)) fileName = `midia.${ext}`;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(res.base64, 'base64'));
  } catch {
    return markFailed('falha ao decodificar mídia');
  }
  if (bytes.length === 0) return markFailed('mídia vazia');

  // Metadados declarados pelo provedor. `seconds` é a duração AUTORITATIVA do
  // áudio: o container Ogg/Opus de nota de voz costuma não trazer duração
  // utilizável, e sem isto a interface fica à mercê do que o navegador adivinha.
  const meta = extractMediaMeta(opts.rawMessage?.message ?? opts.rawMessage);

  try {
    const up = await uploadMessagingMedia({
      companyId: message.companyId,
      conversationId: message.conversationId,
      messageId: message.id,
      fileName,
      contentType: mime,
      bytes,
    });
    await prisma.messageAttachment.create({
      data: {
        companyId: message.companyId, // derivado da mensagem (não do cliente)
        messageId: message.id,
        storagePath: up.path,
        mimeType: up.mimeType,
        sizeBytes: up.sizeBytes,
        checksum: up.checksum ?? null,
        originalFileName: up.originalFileName,
        durationSeconds: meta.durationSeconds ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
      },
    });
    // A mídia FICA disponível mesmo quando incompleta (áudio parcial vale mais
    // para a clínica do que placeholder), mas a divergência é registrada para
    // que truncamento do provedor seja diagnosticável em vez de adivinhado.
    const note = integrityNote(meta, up.sizeBytes, up.checksum);
    if (note) console.warn('[mensageria] mídia inbound incompleta', { messageId: message.id, mimeType: up.mimeType, note });
    await prisma.message.update({
      where: { id: message.id },
      data: { mediaStatus: 'AVAILABLE', ...(note ? { errorMessage: note.slice(0, 200) } : {}) },
    });
    return 'available';
  } catch (e) {
    return markFailed(sanitizeErr(e));
  }
}
