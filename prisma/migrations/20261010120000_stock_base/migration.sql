-- Módulo Estoque — Fase 0 (base): cadastros, lote, saldo (cache) e razão imutável.
-- Desenho: docs/DIRETRIZ_MODULO_ESTOQUE.md. Padrão do Financeiro: companyId em
-- tudo, RLS FORCE + GUC app.company_id (fail-closed) e CHECKs de defesa.

-- CreateEnum
CREATE TYPE "StockItemKind" AS ENUM ('INSUMO', 'MEDICAMENTO', 'INJETAVEL', 'DESCARTAVEL', 'REVENDA', 'USO_INTERNO');

-- CreateEnum
CREATE TYPE "StorageTemp" AS ENUM ('AMBIENTE', 'REFRIGERADO', 'CONGELADO');

-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('ALMOXARIFADO', 'SALA', 'GELADEIRA', 'CARRINHO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StockLotStatus" AS ENUM ('LIBERADO', 'QUARENTENA', 'BLOQUEADO', 'RECOLHIDO');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_AVULSA', 'ENTRADA_BONIFICACAO', 'ENTRADA_DEVOLUCAO', 'CONSUMO_ATENDIMENTO', 'CONSUMO_INTERNO', 'VENDA', 'PERDA', 'DEVOLUCAO_FORNECEDOR', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_INVENTARIO', 'AJUSTE_MANUAL', 'ESTORNO');

-- CreateEnum
CREATE TYPE "ControlledList" AS ENUM ('A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5');

-- CreateEnum
CREATE TYPE "StockConsumptionMode" AS ENUM ('AUTOMATICA', 'CONFIRMADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_ITEM';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_CATEGORY';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_LOCATION';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_LOT';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_MOVEMENT';
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_SETTINGS';

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'REJECTED_NO_BALANCE';

-- CreateTable
CREATE TABLE "stock_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "defaultConsumptionMode" "StockConsumptionMode" NOT NULL DEFAULT 'CONFIRMADA',
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 60,
    "overconsumptionAlertPct" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "kind" "StockItemKind" NOT NULL,
    "manufacturer" TEXT,
    "anvisaRegistration" TEXT,
    "baseUnit" TEXT NOT NULL,
    "purchaseUnit" TEXT,
    "conversionFactor" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "tracksLot" BOOLEAN NOT NULL DEFAULT true,
    "tracksExpiry" BOOLEAN NOT NULL DEFAULT true,
    "tracksPatient" BOOLEAN NOT NULL DEFAULT false,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "controlledList" "ControlledList",
    "controlledNote" TEXT,
    "storageTemp" "StorageTemp" NOT NULL DEFAULT 'AMBIENTE',
    "multiDose" BOOLEAN NOT NULL DEFAULT false,
    "openedShelfLifeHours" INTEGER,
    "minQty" DECIMAL(14,4),
    "reorderPoint" DECIMAL(14,4),
    "maxQty" DECIMAL(14,4),
    "leadTimeDays" INTEGER,
    "preferredSupplierId" TEXT,
    "avgCost" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "lastCost" DECIMAL(14,6),
    "salePrice" DECIMAL(12,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StockLocationType" NOT NULL,
    "roomId" TEXT,
    "storageTemp" "StorageTemp" NOT NULL DEFAULT 'AMBIENTE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "controlledStorage" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "manufacturedAt" TIMESTAMP(3),
    "supplierId" TEXT,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "status" "StockLotStatus" NOT NULL DEFAULT 'LIBERADO',
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "receiptId" TEXT,
    "transferId" TEXT,
    "countId" TEXT,
    "appointmentId" TEXT,
    "patientId" TEXT,
    "professionalId" TEXT,
    "medicalRecordId" TEXT,
    "receivableId" TEXT,
    "openContainerId" TEXT,
    "supplierId" TEXT,
    "reason" TEXT,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_settings_companyId_key" ON "stock_settings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_categories_companyId_name_key" ON "stock_categories"("companyId", "name");

-- CreateIndex
CREATE INDEX "stock_items_companyId_categoryId_idx" ON "stock_items"("companyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_companyId_name_key" ON "stock_items"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_companyId_name_key" ON "stock_locations"("companyId", "name");

-- CreateIndex
CREATE INDEX "stock_lots_companyId_expiresAt_idx" ON "stock_lots"("companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_companyId_itemId_lotNumber_key" ON "stock_lots"("companyId", "itemId", "lotNumber");

-- CreateIndex
CREATE INDEX "stock_balances_companyId_itemId_idx" ON "stock_balances"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "stock_balances_companyId_locationId_idx" ON "stock_balances"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_companyId_itemId_lotId_locationId_key" ON "stock_balances"("companyId", "itemId", "lotId", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_itemId_occurredAt_idx" ON "stock_movements"("companyId", "itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_lotId_idx" ON "stock_movements"("companyId", "lotId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_patientId_idx" ON "stock_movements"("companyId", "patientId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_appointmentId_idx" ON "stock_movements"("companyId", "appointmentId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_type_occurredAt_idx" ON "stock_movements"("companyId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_transferId_idx" ON "stock_movements"("companyId", "transferId");


-- ============================================================================
-- Defesa em profundidade: saldo negativo NUNCA (decisão 2026-10-08). A rota já
-- faz o UPDATE condicional; o CHECK garante mesmo se algum caminho escapar.
-- ============================================================================
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_quantity_nonneg_chk" CHECK ("quantity" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_nonzero_chk" CHECK ("quantity" <> 0);
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_conversion_pos_chk" CHECK ("conversionFactor" > 0);
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_controlled_list_chk" CHECK (NOT "isControlled" OR "controlledList" IS NOT NULL);

-- ============================================================================
-- RLS — mesmo padrão do Financeiro (FORCE + GUC app.company_id; fail-closed).
-- ============================================================================
ALTER TABLE "stock_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_settings" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_settings"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_categories" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_categories"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_items"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_locations" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_locations"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_lots" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_lots"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_balances" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_balances"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_movements"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

