-- WhatsApp multiempresa: instâncias da Evolution API POR CLÍNICA (1:N).
-- Por padrão 1 instância primária por clínica; permite outros números por
-- departamento no futuro. Substitui o WHATSAPP_INSTANCE global.
-- Aditivo: novo enum + nova tabela + FK para companies.

-- CreateEnum
CREATE TYPE "WhatsAppInstanceStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'QRCODE', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "evolutionInstanceId" TEXT,
    "label" TEXT NOT NULL DEFAULT 'Principal',
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "department" TEXT,
    "phoneNumber" TEXT,
    "profileName" TEXT,
    "qrCode" TEXT,
    "status" "WhatsAppInstanceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "webhookToken" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_instanceName_key" ON "whatsapp_instances"("instanceName");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_evolutionInstanceId_key" ON "whatsapp_instances"("evolutionInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_webhookToken_key" ON "whatsapp_instances"("webhookToken");

-- CreateIndex
CREATE INDEX "whatsapp_instances_companyId_idx" ON "whatsapp_instances"("companyId");

-- CreateIndex
CREATE INDEX "whatsapp_instances_status_idx" ON "whatsapp_instances"("status");

-- AddForeignKey
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
