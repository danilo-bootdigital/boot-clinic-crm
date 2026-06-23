-- WhatsApp omnichannel: dedup por externalId, origem (source), foto do contato,
-- e índice de conversa única por número/instância. Tudo aditivo (colunas nullable).

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN "contactAvatar" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "externalId" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "source" TEXT;

-- CreateIndex
CREATE INDEX "whatsapp_conversations_companyId_instanceId_contactPhone_idx" ON "whatsapp_conversations"("companyId", "instanceId", "contactPhone");

-- CreateIndex (dedup; NULLs são distintos no Postgres → não afeta linhas atuais sem externalId)
CREATE UNIQUE INDEX "whatsapp_messages_instanceId_externalId_key" ON "whatsapp_messages"("instanceId", "externalId");
