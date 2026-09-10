-- AlterEnum
ALTER TYPE "EntityType" ADD VALUE 'FOLLOW_UP_TASK';

-- AlterTable
ALTER TABLE "follow_up_tasks" ADD COLUMN     "category" TEXT,
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceEvery" INTEGER,
ADD COLUMN     "recurrenceParentId" TEXT,
ADD COLUMN     "recurrenceType" "RecurrenceType";

-- CreateIndex
CREATE INDEX "follow_up_tasks_companyId_status_dueDate_idx" ON "follow_up_tasks"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "follow_up_tasks_companyId_assignedToId_status_dueDate_idx" ON "follow_up_tasks"("companyId", "assignedToId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "follow_up_tasks_companyId_recurrenceParentId_idx" ON "follow_up_tasks"("companyId", "recurrenceParentId");
