-- Assinatura digitalizada do profissional: caminho no bucket privado
-- `professional-signatures`. Aditiva e nulável — assinatura é opcional, e
-- nenhum registro existente é afetado.
ALTER TABLE "professionals" ADD COLUMN "signaturePath" TEXT;

-- Auditoria de cadastro de profissional (anexo/remocao de assinatura).
-- ADD VALUE e aditivo: nenhum valor existente do enum e alterado.
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'PROFESSIONAL';
