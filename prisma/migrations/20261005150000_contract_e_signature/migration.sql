-- Assinatura eletrônica de contratos (presencial e por link + código no WhatsApp).
-- Aditiva: só colunas novas, todas opcionais ou com default.
ALTER TABLE "patient_contracts" ADD COLUMN "signTokenHash" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "patient_contracts" ADD COLUMN "otpHash" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "patient_contracts" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "patient_contracts" ADD COLUMN "otpSendCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "patient_contracts" ADD COLUMN "otpLastSentAt" TIMESTAMP(3);
ALTER TABLE "patient_contracts" ADD COLUMN "otpSentTo" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "patient_contracts" ADD COLUMN "signMethod" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signerName" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signerCpf" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signerIp" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signerUserAgent" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signedByUserId" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signatureImagePath" TEXT;
ALTER TABLE "patient_contracts" ADD COLUMN "signedPdfPath" TEXT;

CREATE UNIQUE INDEX "patient_contracts_signTokenHash_key" ON "patient_contracts"("signTokenHash");
