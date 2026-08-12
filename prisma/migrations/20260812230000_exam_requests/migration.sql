-- Pedido de exames: catálogo por clínica + pedido com snapshot dos dados
-- impressos. Aditiva: nenhuma tabela ou coluna existente é alterada.

CREATE TYPE "ExamRequestOrigin" AS ENUM ('PATIENT_CHART', 'TELEMEDICINE');

CREATE TABLE "exam_catalog_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_catalog_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_catalog_items_companyId_group_order_idx" ON "exam_catalog_items"("companyId", "group", "order");

CREATE TABLE "exam_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "professionalNameSnapshot" TEXT NOT NULL,
    "professionalCrmSnapshot" TEXT,
    "patientNameSnapshot" TEXT NOT NULL,
    "patientBirthDateSnapshot" TIMESTAMP(3),
    "clinicalIndication" TEXT NOT NULL,
    "observations" TEXT,
    "origin" "ExamRequestOrigin" NOT NULL DEFAULT 'PATIENT_CHART',
    "teleconsultationId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_requests_companyId_patientId_issuedAt_idx" ON "exam_requests"("companyId", "patientId", "issuedAt");
CREATE INDEX "exam_requests_companyId_issuedAt_idx" ON "exam_requests"("companyId", "issuedAt");

CREATE TABLE "exam_request_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "subgroup" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "exam_request_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "exam_request_items_requestId_idx" ON "exam_request_items"("requestId");

ALTER TABLE "exam_request_items" ADD CONSTRAINT "exam_request_items_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "exam_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Auditoria do documento emitido.
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'EXAM_REQUEST';
