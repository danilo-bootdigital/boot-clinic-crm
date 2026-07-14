-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'DOWNLOAD_ATTACHMENT';

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "mediaStatus" TEXT;
