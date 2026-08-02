-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "eventEndDate" TIMESTAMP(3),
ADD COLUMN     "eventEndTime" TEXT,
ADD COLUMN     "eventStartDate" TIMESTAMP(3);
