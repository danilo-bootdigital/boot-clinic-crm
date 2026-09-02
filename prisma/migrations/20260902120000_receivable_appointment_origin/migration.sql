-- ============================================================================
-- ORIGEM DA COBRANÇA: ATENDIMENTO (AGENDA → FINANCEIRO)
--
-- Fecha a lacuna em que um atendimento realizado sem orçamento não tinha como
-- virar conta a receber. Migration ADITIVA e backward-compatible:
--   * nenhuma coluna é removida ou renomeada;
--   * recebíveis existentes continuam válidos (backfill deriva a origem das
--     colunas quoteId/contractId que já existiam);
--   * NÃO há unique em appointmentId — 1 atendimento pode gerar N cobranças
--     (a proteção contra duplicidade acidental é de aplicação, não de banco).
-- ============================================================================

-- CreateEnum
CREATE TYPE "ReceivableSource" AS ENUM ('APPOINTMENT', 'BUDGET', 'CONTRACT', 'MANUAL');

-- AlterTable (colunas nasceram nuláveis p/ não travar linhas existentes)
ALTER TABLE "financial_receivables"
  ADD COLUMN "sourceType"     "ReceivableSource",
  ADD COLUMN "appointmentId"  TEXT,
  ADD COLUMN "sourceSnapshot" JSONB;

-- Backfill determinístico da origem dos recebíveis já existentes.
-- Ordem importa: orçamento manda quando as duas origens estão preenchidas
-- (mesma precedência do serviço, que deriva o valor do orçamento).
UPDATE "financial_receivables"
   SET "sourceType" = CASE
     WHEN "quoteId"    IS NOT NULL THEN 'BUDGET'::"ReceivableSource"
     WHEN "contractId" IS NOT NULL THEN 'CONTRACT'::"ReceivableSource"
     ELSE 'MANUAL'::"ReceivableSource"
   END
 WHERE "sourceType" IS NULL;

-- Sem DEFAULT de propósito: toda cobrança nova precisa declarar a origem
-- explicitamente (um default silencioso rotularia errado a origem).
ALTER TABLE "financial_receivables" ALTER COLUMN "sourceType" SET NOT NULL;

-- CreateIndex (consulta "cobranças deste atendimento", escopada por empresa)
CREATE INDEX "financial_receivables_companyId_appointmentId_idx"
  ON "financial_receivables"("companyId", "appointmentId");

-- Coerência entre o discriminador e o vínculo da origem. O backfill acima
-- satisfaz a constraint por construção (BUDGET só quando quoteId existe etc.),
-- então a validação sobre os dados atuais não pode falhar.
ALTER TABLE "financial_receivables"
  ADD CONSTRAINT "financial_receivables_source_link_chk" CHECK (
    ("sourceType" <> 'APPOINTMENT' OR "appointmentId" IS NOT NULL) AND
    ("sourceType" <> 'BUDGET'      OR "quoteId"       IS NOT NULL) AND
    ("sourceType" <> 'CONTRACT'    OR "contractId"    IS NOT NULL)
  );
