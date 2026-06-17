-- DropIndex
DROP INDEX "patients_cpf_key";

-- CreateIndex
CREATE UNIQUE INDEX "patients_companyId_cpf_key" ON "patients"("companyId", "cpf");

