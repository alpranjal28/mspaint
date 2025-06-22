/*
  Warnings:

  - Made the column `shareCode` on table `Room` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "shareCode" SET NOT NULL,
ALTER COLUMN "shareCode" SET DEFAULT '';
