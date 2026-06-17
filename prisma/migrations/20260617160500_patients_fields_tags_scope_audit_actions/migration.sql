-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionType" ADD VALUE 'CREATE';
ALTER TYPE "ActionType" ADD VALUE 'UPDATE';
ALTER TYPE "ActionType" ADD VALUE 'ARCHIVE';
ALTER TYPE "ActionType" ADD VALUE 'RESTORE';
ALTER TYPE "ActionType" ADD VALUE 'UPLOAD_ATTACHMENT';
ALTER TYPE "ActionType" ADD VALUE 'DELETE_ATTACHMENT';
ALTER TYPE "ActionType" ADD VALUE 'ADD_TAG';
ALTER TYPE "ActionType" ADD VALUE 'REMOVE_TAG';

-- DropIndex
DROP INDEX "tags_name_key";

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "insurance" TEXT,
ADD COLUMN     "insuranceNumber" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tags_companyId_name_key" ON "tags"("companyId", "name");

