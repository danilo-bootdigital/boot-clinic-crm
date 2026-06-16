-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FinalType" AS ENUM ('WON', 'LOST', 'NONE');

-- CreateEnum
CREATE TYPE "DealSource" AS ENUM ('WEBSITE', 'REFERRAL', 'PHONE', 'WHATSAPP', 'SOCIAL_MEDIA', 'WALK_IN', 'EMAIL', 'OTHER');

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "lossReasonId" TEXT,
ADD COLUMN     "pipelineId" TEXT,
ADD COLUMN     "source" "DealSource" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "PipelineStatus" NOT NULL DEFAULT 'ACTIVE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "probability" INTEGER,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "finalType" "FinalType" NOT NULL DEFAULT 'NONE',
    "pipelineId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_loss_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_loss_reasons_pkey" PRIMARY KEY ("id")
);
