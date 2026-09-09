-- Mensagem pronta com anexo (imagem ou PDF). Aditiva:
-- - `content` deixa de ser obrigatório no banco (mensagem pode ser só o
--   anexo, sem legenda) — a regra "texto OU anexo" vira responsabilidade da
--   API, não do schema.
-- - 4 colunas novas, todas nuláveis: mensagem sem anexo não é afetada.
ALTER TABLE "quick_replies" ALTER COLUMN "content" DROP NOT NULL;

ALTER TABLE "quick_replies" ADD COLUMN "attachmentPath" TEXT;
ALTER TABLE "quick_replies" ADD COLUMN "attachmentMimeType" TEXT;
ALTER TABLE "quick_replies" ADD COLUMN "attachmentFileName" TEXT;
ALTER TABLE "quick_replies" ADD COLUMN "attachmentSizeBytes" INTEGER;
