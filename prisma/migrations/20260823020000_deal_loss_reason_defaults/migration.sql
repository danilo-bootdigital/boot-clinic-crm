-- Completa a lista padrão nas clínicas que não tinham motivo NENHUM.
--
-- A migration anterior inseriu só "Distância", então clínica sem semente ficou
-- com um único motivo — e `listLossReasons` não semeia o resto porque já existe
-- linha. Aqui cada clínica passa a ter os seis padrões.
--
-- Guarda: só mexe em clínica SEM motivo removido. Quem já curou a lista
-- (deletedAt preenchido) removeu de propósito, e ressuscitar seria desfazer a
-- decisão de outra pessoa.
INSERT INTO "deal_loss_reasons" ("id", "name", "companyId", "order", "createdAt")
SELECT
  'clr' || substr(md5(gen_random_uuid()::text), 1, 22),
  d."name",
  c."id",
  d."order",
  NOW()
FROM "companies" c
CROSS JOIN (
  VALUES ('Preço', 0), ('Distância', 1), ('Sem retorno', 2),
         ('Escolheu concorrente', 3), ('Sem interesse', 4), ('Outro', 5)
) AS d("name", "order")
WHERE NOT EXISTS (
  SELECT 1 FROM "deal_loss_reasons" r
  WHERE r."companyId" = c."id" AND r."name" = d."name"
)
AND NOT EXISTS (
  SELECT 1 FROM "deal_loss_reasons" r
  WHERE r."companyId" = c."id" AND r."deletedAt" IS NOT NULL
);
