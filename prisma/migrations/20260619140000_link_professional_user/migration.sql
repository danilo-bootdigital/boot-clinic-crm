-- Vincula Profissional da agenda à conta de acesso (usuário com papel DOCTOR).
-- Aditivo: adiciona coluna opcional + backfill dos médicos já cadastrados.

ALTER TABLE "professionals" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "professionals_userId_key" ON "professionals"("userId");

ALTER TABLE "professionals"
  ADD CONSTRAINT "professionals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: para cada usuário DOCTOR ativo sem profissional vinculado,
-- cria o Professional correspondente (id determinístico para ser idempotente).
INSERT INTO "professionals" ("id", "name", "email", "companyId", "userId", "isActive", "createdAt", "updatedAt")
SELECT
  'prof_user_' || u."id",
  u."name",
  u."email",
  u."companyId",
  u."id",
  true,
  NOW(),
  NOW()
FROM "users" u
WHERE u."role" = 'DOCTOR'
  AND u."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "professionals" p WHERE p."userId" = u."id"
  );
