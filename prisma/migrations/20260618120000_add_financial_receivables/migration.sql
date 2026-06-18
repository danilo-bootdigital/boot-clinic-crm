-- ============================================================================
-- MÓDULO FINANCEIRO — FASE 1: CONTAS A RECEBER
-- 4 tabelas novas + 3 enums novos + extensões aditivas de EntityType/ActionType.
-- Dinheiro em DECIMAL(12,2). Multi-tenant por companyId + RLS (FORCE + GUC).
-- Nenhuma tabela existente é alterada (só ADD VALUE nos enums de auditoria).
-- ============================================================================

-- AlterEnum (entidades de auditoria do módulo Financeiro — aditivo)
ALTER TYPE "EntityType" ADD VALUE 'RECEIVABLE';
ALTER TYPE "EntityType" ADD VALUE 'RECEIVABLE_INSTALLMENT';
ALTER TYPE "EntityType" ADD VALUE 'INSTALLMENT_PAYMENT';
ALTER TYPE "EntityType" ADD VALUE 'REVENUE_CATEGORY';

-- AlterEnum (ações financeiras — aditivo)
ALTER TYPE "ActionType" ADD VALUE 'SETTLE';
ALTER TYPE "ActionType" ADD VALUE 'CANCEL';
ALTER TYPE "ActionType" ADD VALUE 'REVERSE';

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'TRANSFERENCIA', 'BOLETO', 'CHEQUE', 'OUTRO');

-- CreateTable
CREATE TABLE "financial_revenue_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_revenue_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_receivables" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "quoteId" TEXT,
    "contractId" TEXT,
    "dealId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalAmount" DECIMAL(12,2) NOT NULL,
    "installmentsCount" INTEGER NOT NULL DEFAULT 1,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDENTE',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "financial_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_installments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_revenue_categories_companyId_idx" ON "financial_revenue_categories"("companyId");
CREATE UNIQUE INDEX "financial_revenue_categories_companyId_name_key" ON "financial_revenue_categories"("companyId", "name");

-- CreateIndex
CREATE INDEX "financial_receivables_companyId_status_idx" ON "financial_receivables"("companyId", "status");
CREATE INDEX "financial_receivables_companyId_patientId_idx" ON "financial_receivables"("companyId", "patientId");
CREATE INDEX "financial_receivables_companyId_issueDate_idx" ON "financial_receivables"("companyId", "issueDate");

-- CreateIndex (anti-duplicação: 1 orçamento/contrato → no máximo 1 receita ATIVA).
-- Exclui CANCELADO p/ permitir refaturar a mesma origem após um cancelamento.
CREATE UNIQUE INDEX "financial_receivables_quoteId_active_key" ON "financial_receivables"("quoteId") WHERE "quoteId" IS NOT NULL AND "deletedAt" IS NULL AND "status" <> 'CANCELADO';
CREATE UNIQUE INDEX "financial_receivables_contractId_active_key" ON "financial_receivables"("contractId") WHERE "contractId" IS NOT NULL AND "deletedAt" IS NULL AND "status" <> 'CANCELADO';

-- CreateIndex
CREATE UNIQUE INDEX "financial_installments_receivableId_number_key" ON "financial_installments"("receivableId", "number");
CREATE INDEX "financial_installments_companyId_status_idx" ON "financial_installments"("companyId", "status");
CREATE INDEX "financial_installments_companyId_dueDate_idx" ON "financial_installments"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "financial_payments_companyId_paidAt_idx" ON "financial_payments"("companyId", "paidAt");
CREATE INDEX "financial_payments_installmentId_idx" ON "financial_payments"("installmentId");

-- AddForeignKey
ALTER TABLE "financial_receivables" ADD CONSTRAINT "financial_receivables_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "financial_revenue_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_installments" ADD CONSTRAINT "financial_installments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "financial_receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_payments" ADD CONSTRAINT "financial_payments_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "financial_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints de integridade financeira (CHECK) — defesa contra valores inválidos.
ALTER TABLE "financial_receivables"
  ADD CONSTRAINT "financial_receivables_amounts_nonneg_chk"
  CHECK ("originalAmount" >= 0 AND "discountAmount" >= 0 AND "finalAmount" >= 0 AND "installmentsCount" >= 1);

ALTER TABLE "financial_installments"
  ADD CONSTRAINT "financial_installments_amounts_chk"
  CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");

ALTER TABLE "financial_payments"
  ADD CONSTRAINT "financial_payments_amount_pos_chk"
  CHECK ("amount" > 0);

-- ============================================================================
-- RLS — isolamento multiempresa no Postgres (defesa em profundidade; o filtro
-- companyId da aplicação continua sendo a 1ª camada). FORCE para valer também
-- ao owner. A aplicação seta `app.company_id` por transação (withFinanceTenant).
-- current_setting(..., true) = NULL quando ausente ⇒ fail-closed (0 linhas).
-- ============================================================================
ALTER TABLE "financial_revenue_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_revenue_categories" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_revenue_categories"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_receivables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_receivables" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_receivables"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_installments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_installments" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_installments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "financial_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_payments" FORCE  ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_payments"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
