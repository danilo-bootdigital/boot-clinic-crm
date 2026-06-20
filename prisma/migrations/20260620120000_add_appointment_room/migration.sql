-- Sala física do atendimento presencial na agenda.
-- FK escalar nulável (mesmo padrão de patientId/professionalId em appointments:
-- sem constraint de banco), portanto totalmente backward-compatible com as
-- consultas existentes, que ficam com roomId = NULL.

ALTER TABLE "appointments" ADD COLUMN "roomId" TEXT;

CREATE INDEX "appointments_roomId_idx" ON "appointments"("roomId");
