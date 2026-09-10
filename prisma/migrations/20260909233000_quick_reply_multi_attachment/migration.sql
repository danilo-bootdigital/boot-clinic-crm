-- Mensagem pronta ganha VÁRIOS anexos (imagem/PDF), cada um com legenda
-- própria, em vez de um anexo único solto em 4 colunas de quick_replies.

CREATE TABLE "quick_reply_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quickReplyId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_reply_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_reply_attachments_companyId_idx" ON "quick_reply_attachments"("companyId");
CREATE INDEX "quick_reply_attachments_quickReplyId_order_idx" ON "quick_reply_attachments"("quickReplyId", "order");

ALTER TABLE "quick_reply_attachments" ADD CONSTRAINT "quick_reply_attachments_quickReplyId_fkey"
    FOREIGN KEY ("quickReplyId") REFERENCES "quick_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra o anexo único que já existia (se houver) para a nova tabela, como o
-- primeiro (e único) item, sem legenda própria — a legenda geral do anexo
-- antigo era o campo `content`, que continua intacto em quick_replies.
-- Prefixo "atc_" evita qualquer colisão com ids cuid() gerados pelo Prisma.
INSERT INTO "quick_reply_attachments" ("id", "companyId", "quickReplyId", "path", "mimeType", "fileName", "sizeBytes", "order")
SELECT 'atc_' || "id", "companyId", "id", "attachmentPath", "attachmentMimeType", COALESCE("attachmentFileName", 'arquivo'), COALESCE("attachmentSizeBytes", 0), 0
FROM "quick_replies"
WHERE "attachmentPath" IS NOT NULL;

ALTER TABLE "quick_replies" DROP COLUMN "attachmentPath";
ALTER TABLE "quick_replies" DROP COLUMN "attachmentMimeType";
ALTER TABLE "quick_replies" DROP COLUMN "attachmentFileName";
ALTER TABLE "quick_replies" DROP COLUMN "attachmentSizeBytes";
