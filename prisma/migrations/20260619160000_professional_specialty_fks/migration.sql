-- Relação Profissional <-> Especialidade (tabela de junção já existia sem FKs).
-- Limpa eventuais vínculos órfãos antes de aplicar as constraints.

DELETE FROM "professional_specialties" ps
WHERE NOT EXISTS (SELECT 1 FROM "professionals" p WHERE p."id" = ps."professionalId")
   OR NOT EXISTS (SELECT 1 FROM "specialties" s WHERE s."id" = ps."specialtyId");

ALTER TABLE "professional_specialties"
  ADD CONSTRAINT "professional_specialties_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "professionals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "professional_specialties"
  ADD CONSTRAINT "professional_specialties_specialtyId_fkey"
  FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
