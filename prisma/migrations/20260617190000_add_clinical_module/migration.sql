-- CreateEnum
CREATE TYPE "AnamnesisQuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'BOOLEAN', 'NUMBER', 'DATE', 'FILE');

-- CreateEnum
CREATE TYPE "AnamnesisStatus" AS ENUM ('DRAFT', 'FILLED', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MedicalRecordType" AS ENUM ('EVOLUTION', 'OBSERVATION', 'HISTORY', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'CANCELED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImageCategory" AS ENUM ('BEFORE', 'AFTER', 'EXAM', 'CLINICAL', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('EXAM', 'REPORT', 'CONTRACT', 'CONSENT', 'RECEIPT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntityType" ADD VALUE 'ANAMNESIS';
ALTER TYPE "EntityType" ADD VALUE 'MEDICAL_RECORD';
ALTER TYPE "EntityType" ADD VALUE 'CONTRACT';
ALTER TYPE "EntityType" ADD VALUE 'QUOTE';
ALTER TYPE "EntityType" ADD VALUE 'PATIENT_IMAGE';
ALTER TYPE "EntityType" ADD VALUE 'PATIENT_DOCUMENT';

-- CreateTable
CREATE TABLE "anamnesis_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "anamnesis_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anamnesis_questions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "AnamnesisQuestionType" NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anamnesis_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_anamneses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "status" "AnamnesisStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patient_anamneses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_anamnesis_answers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "anamnesisId" TEXT NOT NULL,
    "questionId" TEXT,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_anamnesis_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "MedicalRecordType" NOT NULL DEFAULT 'EVOLUTION',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "professionalId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_record_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_record_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB,
    "value" DOUBLE PRECISION,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patient_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_quotes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clinical_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_quote_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_images" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "ImageCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3),
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patient_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "anamnesis_questions" ADD CONSTRAINT "anamnesis_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "anamnesis_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_anamnesis_answers" ADD CONSTRAINT "patient_anamnesis_answers_anamnesisId_fkey" FOREIGN KEY ("anamnesisId") REFERENCES "patient_anamneses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record_attachments" ADD CONSTRAINT "medical_record_attachments_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_quote_items" ADD CONSTRAINT "clinical_quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "clinical_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

