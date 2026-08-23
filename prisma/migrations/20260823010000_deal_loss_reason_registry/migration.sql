-- Cadastro de motivos de perda: ordem de exibição + remoção reversível.
--
-- `deletedAt` (e não DELETE) porque o negócio perdido guarda o lossReasonId: sem
-- a linha, o relatório mostraria um id órfão em vez do motivo.
-- Auditoria do próprio cadastro (quem criou/renomeou/removeu um motivo).
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'DEAL_LOSS_REASON';

ALTER TABLE "deal_loss_reasons" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "deal_loss_reasons" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "deal_loss_reasons_companyId_deletedAt_idx" ON "deal_loss_reasons"("companyId", "deletedAt");

-- Ordem pedida pela clínica: Preço e Distância primeiro, o resto depois.
UPDATE "deal_loss_reasons"
SET "order" = CASE "name"
  WHEN 'Preço' THEN 0
  WHEN 'Distância' THEN 1
  WHEN 'Sem retorno' THEN 2
  WHEN 'Escolheu concorrente' THEN 3
  WHEN 'Sem interesse' THEN 4
  WHEN 'Outro' THEN 5
  ELSE 9
END;

-- "Distância" passa a existir em toda clínica que ainda não tem (o cadastro
-- nasceu na semente sem ele). Idempotente: repetir a migration não duplica.
INSERT INTO "deal_loss_reasons" ("id", "name", "companyId", "order", "createdAt")
SELECT
  'clr' || substr(md5(gen_random_uuid()::text), 1, 22),
  'Distância',
  c."id",
  1,
  NOW()
FROM "companies" c
WHERE NOT EXISTS (
  SELECT 1 FROM "deal_loss_reasons" r
  WHERE r."companyId" = c."id" AND r."name" = 'Distância'
);
