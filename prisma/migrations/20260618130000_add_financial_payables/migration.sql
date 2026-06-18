-- ============================================================================
-- MÓDULO FINANCEIRO — FASE 2: CONTAS A PAGAR
-- 5 tabelas novas + 1 enum novo + extensão aditiva de EntityType.
-- Simétrico aos recebíveis: Decimal(12,2), companyId, RLS FORCE+GUC, audit.
-- ============================================================================

-- AlterEnum (entidades de auditoria do Contas a Pagar — aditivo)
ALTER TYPE "EntityType" ADD VALUE 'PAYABLE';
ALTER TYPE "EntityType" ADD VALUE 'PAYABLE_PAYMENT';
ALTER TYPE "EntityType" ADD VALUE 'SUPPLIER';
ALTER TYPE "EntityType" ADD VALUE 'EXPENSE_CATEGORY';
ALTER TYPE "EntityType" ADD VALUE 'COST_CENTER';

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO');

-- CreateTable
CREATE TABLE "financial_suppliers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "financial_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_expense_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_cost_centers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payables" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "categoryId" TEXT,
    "costCenterId" TEXT,
    "professionalId" TEXT,
    "description" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PayableStatus" NOT NULL DEFAULT 'PENDENTE',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "financial_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payable_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_suppliers_companyId_idx" ON "financial_suppliers"("companyId");
CREATE UNIQUE INDEX "financial_suppliers_companyId_name_key" ON "financial_suppliers"("companyId", "name");
CREATE INDEX "financial_expense_categories_companyId_idx" ON "financial_expense_categories"("companyId");
CREATE UNIQUE INDEX "financial_expense_categories_companyId_name_key" ON "financial_expense_categories"("companyId", "name");
CREATE INDEX "financial_cost_centers_companyId_idx" ON "financial_cost_centers"("companyId");
CREATE UNIQUE INDEX "financial_cost_centers_companyId_name_key" ON "financial_cost_centers"("companyId", "name");
CREATE INDEX "financial_payables_companyId_status_idx" ON "financial_payables"("companyId", "status");
CREATE INDEX "financial_payables_companyId_dueDate_idx" ON "financial_payables"("companyId", "dueDate");
CREATE INDEX "financial_payables_companyId_supplierId_idx" ON "financial_payables"("companyId", "supplierId");
CREATE INDEX "financial_payable_payments_companyId_paidAt_idx" ON "financial_payable_payments"("companyId", "paidAt");
CREATE INDEX "financial_payable_payments_payableId_idx" ON "financial_payable_payments"("payableId");

-- AddForeignKey
ALTER TABLE "financial_payables" ADD CONSTRAINT "financial_payables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "financial_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payables" ADD CONSTRAINT "financial_payables_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payables" ADD CONSTRAINT "financial_payables_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "financial_cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_payable_payments" ADD CONSTRAINT "financial_payable_payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "financial_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints de integridade financeira (CHECK)
ALTER TABLE "financial_payables"
  ADD CONSTRAINT "financial_payables_amounts_chk"
  CHECK ("originalAmount" >= 0 AND "discountAmount" >= 0 AND "finalAmount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "finalAmount");

ALTER TABLE "financial_payable_payments"
  ADD CONSTRAINT "financial_payable_payments_amount_pos_chk"
  CHECK ("amount" > 0);

-- ============================================================================
-- RLS — mesmo padrão dos recebíveis (FORCE + GUC app.company_id; fail-closed).
-- ============================================================================
ALTER TABLE "financial_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_suppliers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_suppliers"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_expense_categories" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_expense_categories"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_cost_centers" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_cost_centers"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_payables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_payables" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_payables"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_payable_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_payable_payments" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_payable_payments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
