-- Módulo Estoque — Fase 3: ficha técnica (kit) + situação da baixa no
-- atendimento. Só aditiva. RLS FORCE + GUC, como as fases anteriores.

-- CreateEnum
CREATE TYPE "StockUsageStatus" AS ENUM ('PENDENTE', 'CONFIRMADO', 'AUTOMATICO');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'PROCEDURE_KIT';

-- CreateTable
CREATE TABLE "stock_procedure_kits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appointmentType" TEXT,
    "consumptionMode" "StockConsumptionMode",
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_procedure_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_procedure_kit_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_procedure_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_appointment_usages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "StockUsageStatus" NOT NULL DEFAULT 'PENDENTE',
    "mode" "StockConsumptionMode" NOT NULL,
    "kitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_appointment_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_procedure_kits_companyId_appointmentType_idx" ON "stock_procedure_kits"("companyId", "appointmentType");

-- CreateIndex
CREATE UNIQUE INDEX "stock_procedure_kits_companyId_name_key" ON "stock_procedure_kits"("companyId", "name");

-- CreateIndex
CREATE INDEX "stock_procedure_kit_items_kitId_idx" ON "stock_procedure_kit_items"("kitId");

-- CreateIndex
CREATE INDEX "stock_appointment_usages_companyId_status_idx" ON "stock_appointment_usages"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_appointment_usages_companyId_appointmentId_key" ON "stock_appointment_usages"("companyId", "appointmentId");

-- AddForeignKey
ALTER TABLE "stock_procedure_kit_items" ADD CONSTRAINT "stock_procedure_kit_items_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "stock_procedure_kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "stock_procedure_kit_items" ADD CONSTRAINT "stock_procedure_kit_items_qty_nonneg_chk" CHECK ("quantity" >= 0);

ALTER TABLE "stock_procedure_kits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_procedure_kits" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_procedure_kits"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_procedure_kit_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_procedure_kit_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_procedure_kit_items"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_appointment_usages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_appointment_usages" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_appointment_usages"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

