-- CreateEnum
CREATE TYPE "AppointmentModality" AS ENUM ('PRESENCIAL', 'TELEMEDICINA');

-- CreateEnum
CREATE TYPE "TelemedicineStatus" AS ENUM ('AGENDADA', 'AGUARDANDO_PACIENTE', 'PACIENTE_ENTROU', 'MEDICO_ENTROU', 'EM_ATENDIMENTO', 'PAUSADA', 'FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "TelemedicineProvider" AS ENUM ('JITSI', 'DAILY', 'TWILIO', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('PATIENT', 'DOCTOR', 'GUEST');

-- CreateEnum
CREATE TYPE "TelemedicineAttachmentCategory" AS ENUM ('EXAM', 'REPORT', 'CLINICAL_PHOTO', 'DOCUMENT', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "TelemedicineAttachmentPhase" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- AlterEnum (entidades de auditoria do módulo Telemedicina)
ALTER TYPE "EntityType" ADD VALUE 'TELECONSULTATION';
ALTER TYPE "EntityType" ADD VALUE 'TELEMEDICINE_ROOM';
ALTER TYPE "EntityType" ADD VALUE 'TELEMEDICINE_CONSENT';
ALTER TYPE "EntityType" ADD VALUE 'TELEMEDICINE_ATTACHMENT';

-- AlterTable (modalidade da consulta + atalho p/ a sala — aditivo)
ALTER TABLE "appointments" ADD COLUMN "modality" "AppointmentModality" NOT NULL DEFAULT 'PRESENCIAL';
ALTER TABLE "appointments" ADD COLUMN "roomUrl" TEXT;

-- AlterTable (vínculo opcional consulta/teleconsulta)
ALTER TABLE "patient_anamneses" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "patient_anamneses" ADD COLUMN "teleconsultationId" TEXT;
ALTER TABLE "medical_records" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "medical_records" ADD COLUMN "teleconsultationId" TEXT;

-- CreateTable
CREATE TABLE "telemedicine_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "TelemedicineStatus" NOT NULL DEFAULT 'AGENDADA',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "patientJoinedAt" TIMESTAMP(3),
    "doctorJoinedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "noShowAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "medicalRecordId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "telemedicine_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_rooms" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" "TelemedicineProvider" NOT NULL DEFAULT 'JITSI',
    "roomKey" TEXT NOT NULL,
    "roomUrl" TEXT NOT NULL,
    "publicSlug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemedicine_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_participants" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemedicine_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_consents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemedicine_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_chat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "senderRole" "ParticipantRole" NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemedicine_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_attachments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "TelemedicineAttachmentCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "phase" "TelemedicineAttachmentPhase" NOT NULL DEFAULT 'DURING',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "telemedicine_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorRole" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemedicine_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telemedicine_sessions_appointmentId_key" ON "telemedicine_sessions"("appointmentId");
CREATE INDEX "telemedicine_sessions_companyId_status_idx" ON "telemedicine_sessions"("companyId", "status");
CREATE INDEX "telemedicine_sessions_companyId_scheduledAt_idx" ON "telemedicine_sessions"("companyId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "telemedicine_rooms_sessionId_key" ON "telemedicine_rooms"("sessionId");
CREATE UNIQUE INDEX "telemedicine_rooms_roomKey_key" ON "telemedicine_rooms"("roomKey");
CREATE UNIQUE INDEX "telemedicine_rooms_publicSlug_key" ON "telemedicine_rooms"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "telemedicine_participants_token_key" ON "telemedicine_participants"("token");
CREATE INDEX "telemedicine_participants_sessionId_idx" ON "telemedicine_participants"("sessionId");

-- CreateIndex
CREATE INDEX "telemedicine_consents_sessionId_idx" ON "telemedicine_consents"("sessionId");

-- CreateIndex
CREATE INDEX "telemedicine_chat_sessionId_createdAt_idx" ON "telemedicine_chat"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "telemedicine_attachments_sessionId_idx" ON "telemedicine_attachments"("sessionId");

-- CreateIndex
CREATE INDEX "telemedicine_audit_logs_sessionId_createdAt_idx" ON "telemedicine_audit_logs"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "telemedicine_rooms" ADD CONSTRAINT "telemedicine_rooms_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telemedicine_participants" ADD CONSTRAINT "telemedicine_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telemedicine_consents" ADD CONSTRAINT "telemedicine_consents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telemedicine_chat" ADD CONSTRAINT "telemedicine_chat_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telemedicine_attachments" ADD CONSTRAINT "telemedicine_attachments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telemedicine_audit_logs" ADD CONSTRAINT "telemedicine_audit_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "telemedicine_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
