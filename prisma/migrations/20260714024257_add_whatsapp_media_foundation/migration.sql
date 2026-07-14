-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "messageType" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "replyToExternalId" TEXT,
ADD COLUMN     "replyToMessageId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "whatsapp_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "durationSeconds" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "providerMediaId" TEXT,
    "providerUrl" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "instanceId" TEXT,
    "eventType" TEXT NOT NULL,
    "messageType" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "payloadHash" TEXT,
    "correlationId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_attachments_companyId_idx" ON "whatsapp_attachments"("companyId");

-- CreateIndex
CREATE INDEX "whatsapp_attachments_messageId_idx" ON "whatsapp_attachments"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_companyId_createdAt_idx" ON "whatsapp_webhook_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_instanceId_externalId_idx" ON "whatsapp_webhook_events"("instanceId", "externalId");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_eventType_idx" ON "whatsapp_webhook_events"("eventType");

-- CreateIndex
CREATE INDEX "whatsapp_messages_companyId_createdAt_idx" ON "whatsapp_messages"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_attachments" ADD CONSTRAINT "whatsapp_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
