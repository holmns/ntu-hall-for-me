-- DropIndex
DROP INDEX "Listing_embedding_idx";

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "deposit" INTEGER,
ADD COLUMN     "housemates" INTEGER,
ADD COLUMN     "maxTermMonths" INTEGER,
ADD COLUMN     "minTermMonths" INTEGER;
