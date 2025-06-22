/*
  Warnings:

  - A unique constraint covering the columns `[shareCode]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "shareCode" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_shareCode_key" ON "Room"("shareCode");
