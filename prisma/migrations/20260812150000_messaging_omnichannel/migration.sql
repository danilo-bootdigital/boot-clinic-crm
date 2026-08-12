-- Mensageria omnichannel: substitui o módulo WhatsApp por canais.
-- Desenho: docs/DIRETRIZ_MENSAGERIA_OMNICHANNEL.md
--
-- MIGRAÇÃO DESTRUTIVA — autorizada explicitamente pelo dono do produto em
-- 2026-08-12 porque produção ainda não tem cliente. O que se perde são
-- conversas de teste. Esta autorização NÃO se repete: com cliente em
-- produção, mudança nessas tabelas exige migração preservadora.

-- ---------------------------------------------------------------------------
-- 1. Remove o módulo WhatsApp
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "whatsapp_attachments" CASCADE;
DROP TABLE IF EXISTS "whatsapp_messages" CASCADE;
DROP TABLE IF EXISTS "whatsapp_conversations" CASCADE;
DROP TABLE IF EXISTS "whatsapp_instances" CASCADE;
DROP TABLE IF EXISTS "whatsapp_webhook_events" CASCADE;
DROP TABLE IF EXISTS "whatsapp_quick_replies" CASCADE;
DROP TYPE IF EXISTS "WhatsAppInstanceStatus";

-- ---------------------------------------------------------------------------
-- 2. Enums da mensageria
-- ---------------------------------------------------------------------------
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'TIKTOK');
CREATE TYPE "MessageSource" AS ENUM ('CONTACT', 'CRM', 'MOBILE', 'AUTOMATION');
CREATE TYPE "MessageEntryPoint" AS ENUM ('DIRECT', 'AD', 'STORY_REPLY', 'POST_COMMENT', 'PROFILE_LINK', 'LEAD_FORM');
CREATE TYPE "ChannelAccountStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'QRCODE', 'CONNECTED', 'ERROR');

-- ---------------------------------------------------------------------------
-- 3. Contas de canal da clínica
-- ---------------------------------------------------------------------------
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Principal',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "department" TEXT,
    "externalId" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "status" "ChannelAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastConnectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "providerConfig" JSONB,
    "providerEventsVersion" INTEGER NOT NULL DEFAULT 0,
    "webhookToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_accounts_webhookToken_key" ON "channel_accounts"("webhookToken");
CREATE UNIQUE INDEX "channel_accounts_channel_externalId_key" ON "channel_accounts"("channel", "externalId");
CREATE INDEX "channel_accounts_companyId_channel_idx" ON "channel_accounts"("companyId", "channel");
CREATE INDEX "channel_accounts_status_idx" ON "channel_accounts"("status");

ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Contato e identidades por canal
-- ---------------------------------------------------------------------------
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "patientId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contacts_companyId_phone_idx" ON "contacts"("companyId", "phone");
CREATE INDEX "contacts_companyId_name_idx" ON "contacts"("companyId", "name");
CREATE INDEX "contacts_patientId_idx" ON "contacts"("patientId");

CREATE TABLE "contact_identities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_identities_companyId_channel_externalId_key"
    ON "contact_identities"("companyId", "channel", "externalId");
CREATE INDEX "contact_identities_contactId_idx" ON "contact_identities"("contactId");

ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Conversas e mensagens
-- ---------------------------------------------------------------------------
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "accountId" TEXT,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessage" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "entryPoint" "MessageEntryPoint",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_companyId_lastMessageAt_idx" ON "conversations"("companyId", "lastMessageAt");
CREATE INDEX "conversations_companyId_channel_status_idx" ON "conversations"("companyId", "channel", "status");
CREATE INDEX "conversations_contactId_idx" ON "conversations"("contactId");
CREATE INDEX "conversations_accountId_idx" ON "conversations"("accountId");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "accountId" TEXT,
    "source" "MessageSource" NOT NULL,
    "externalId" TEXT,
    "content" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageType" TEXT,
    "caption" TEXT,
    "replyToMessageId" TEXT,
    "replyToExternalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdByUserId" TEXT,
    "entryPoint" "MessageEntryPoint",
    "referral" JSONB,
    "mediaStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");
CREATE INDEX "messages_companyId_createdAt_idx" ON "messages"("companyId", "createdAt");
CREATE INDEX "messages_companyId_channel_createdAt_idx" ON "messages"("companyId", "channel", "createdAt");
CREATE UNIQUE INDEX "messages_accountId_externalId_key" ON "messages"("accountId", "externalId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Anexos
-- ---------------------------------------------------------------------------
CREATE TABLE "message_attachments" (
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

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_attachments_companyId_idx" ON "message_attachments"("companyId");
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");

ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Observabilidade de webhook e respostas rápidas
-- ---------------------------------------------------------------------------
CREATE TABLE "channel_webhook_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "channel" "Channel",
    "accountId" TEXT,
    "eventType" TEXT NOT NULL,
    "messageType" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "payloadHash" TEXT,
    "correlationId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "channel_webhook_events_companyId_createdAt_idx" ON "channel_webhook_events"("companyId", "createdAt");
CREATE INDEX "channel_webhook_events_accountId_externalId_idx" ON "channel_webhook_events"("accountId", "externalId");
CREATE INDEX "channel_webhook_events_eventType_idx" ON "channel_webhook_events"("eventType");

CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_replies_companyId_idx" ON "quick_replies"("companyId");
