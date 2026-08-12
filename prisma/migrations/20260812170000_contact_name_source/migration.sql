-- Procedência do nome do contato + reparo dos contatos batizados errado.
--
-- Bug: `pushName` do WhatsApp é o nome de QUEM ENVIOU. Em mensagem `fromMe`
-- quem envia é a clínica, então o pushName é o nome do DONO do número enquanto
-- o telefone é o da outra pessoa. O sync de histórico (cheio de fromMe) batizou
-- todos os contatos com o nome do dono.
--
-- Aditiva: nenhuma coluna ou tabela é removida.

-- ---------------------------------------------------------------------------
-- 1. De onde veio o nome
-- ---------------------------------------------------------------------------
CREATE TYPE "ContactNameSource" AS ENUM ('CHANNEL', 'MANUAL');

ALTER TABLE "contacts"
  ADD COLUMN "nameSource" "ContactNameSource" NOT NULL DEFAULT 'CHANNEL';

-- ---------------------------------------------------------------------------
-- 2. Reparo dos nomes corrompidos
-- ---------------------------------------------------------------------------
-- Heurística: um MESMO nome, vindo do canal, repetido em 2+ contatos da mesma
-- clínica é o nome do dono do número espalhado pelo sync. Volta para o telefone
-- (ou para o id do canal), e a próxima mensagem RECEBIDA reaprende o nome certo
-- — agora sob a regra nova, que só aceita nome de mensagem recebida.
--
-- Efeito colateral aceito: dois contatos homônimos de verdade também voltam ao
-- telefone e reaprendem. Preferível a manter todo mundo com o nome errado.
WITH duplicados AS (
  SELECT "companyId", "name"
  FROM "contacts"
  WHERE "deletedAt" IS NULL
    AND "nameSource" = 'CHANNEL'
  GROUP BY "companyId", "name"
  HAVING COUNT(*) > 1
)
UPDATE "contacts" c
SET "name" = COALESCE(
      NULLIF(c."phone", ''),
      (SELECT ci."externalId"
         FROM "contact_identities" ci
        WHERE ci."contactId" = c."id"
        ORDER BY ci."createdAt" ASC
        LIMIT 1),
      c."name"
    )
FROM duplicados d
WHERE c."companyId" = d."companyId"
  AND c."name" = d."name"
  AND c."deletedAt" IS NULL
  AND c."nameSource" = 'CHANNEL';
