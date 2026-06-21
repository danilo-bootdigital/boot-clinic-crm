-- Vincula conversas e mensagens à instância (número) de origem/destino.
-- instanceId nullable: conversas antigas ficam null (= usar a primária da clínica).
-- Aditivo: novas colunas + índices + FKs (ON DELETE SET NULL). Sem backfill.

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN "instanceId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN "instanceId" TEXT;

-- CreateIndex
CREATE INDEX "whatsapp_conversations_instanceId_idx" ON "whatsapp_conversations"("instanceId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_companyId_lastMessageAt_idx" ON "whatsapp_conversations"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "whatsapp_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
