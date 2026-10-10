-- Módulo Estoque — Fase 2: recebimento de mercadoria (conferência da nota →
-- ENTRADA_COMPRA + Contas a Pagar). Só aditiva. RLS FORCE + GUC, como a Fase 0.

-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('RASCUNHO', 'CONFIRMADO', 'ESTORNADO');

-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'STOCK_RECEIPT';

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "invoiceNumber" TEXT,
    "invoiceKey" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "freight" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'RASCUNHO',
    "payableIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payablePending" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reverseReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "locationId" TEXT NOT NULL,
    "qtyPurchase" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(14,6),
    "movementId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_receipts_companyId_status_receivedAt_idx" ON "stock_receipts"("companyId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "stock_receipts_companyId_supplierId_idx" ON "stock_receipts"("companyId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_companyId_number_key" ON "stock_receipts"("companyId", "number");

-- CreateIndex
CREATE INDEX "stock_receipt_items_companyId_itemId_idx" ON "stock_receipt_items"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "stock_receipt_items_receiptId_idx" ON "stock_receipt_items"("receiptId");

-- AddForeignKey
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_amounts_nonneg_chk" CHECK ("freight" >= 0 AND "discount" >= 0 AND "total" >= 0);
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_qty_pos_chk" CHECK ("qtyPurchase" > 0 AND "unitPrice" >= 0);

ALTER TABLE "stock_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_receipts" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_receipts"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "stock_receipt_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_receipt_items" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_receipt_items"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

