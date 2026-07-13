-- Texto livre da anamnese (conteúdo principal no modo "sem modelo" e
-- observações complementares no modo com modelo).
-- Coluna TEXT nulável: sem limite artificial de tamanho e totalmente
-- backward-compatible — anamneses existentes ficam com notes = NULL.

ALTER TABLE "patient_anamneses" ADD COLUMN "notes" TEXT;
