-- SEC2: token de webhook WhatsApp por clínica (roteamento multiempresa do inbound).
-- Aditivo: coluna nullable + índice único (NULLs são distintos no Postgres).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "whatsappWebhookToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "companies_whatsappWebhookToken_key" ON "companies"("whatsappWebhookToken");
