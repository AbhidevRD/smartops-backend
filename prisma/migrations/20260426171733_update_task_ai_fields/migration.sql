-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedHours" INTEGER NOT NULL DEFAULT 0;
