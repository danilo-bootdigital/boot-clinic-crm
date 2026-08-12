-- Vínculo Deal → Contact: a oportunidade criada a partir de uma conversa da
-- mensageria aponta para o contato que a originou (diretriz §5).
--
-- Aditiva e nulável: deal criado à mão no CRM não tem contato de canal, e
-- nenhuma linha existente é afetada.
ALTER TABLE "deals" ADD COLUMN "contactId" TEXT;

-- Suporta a checagem de "este contato já tem oportunidade aberta?", que roda
-- antes de criar para não duplicar deal a cada clique.
CREATE INDEX "deals_companyId_contactId_idx" ON "deals"("companyId", "contactId");
