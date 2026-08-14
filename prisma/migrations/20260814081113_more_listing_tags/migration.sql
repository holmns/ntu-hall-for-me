-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ListingTag" ADD VALUE 'WATER_HEATER';
ALTER TYPE "ListingTag" ADD VALUE 'BALCONY';
ALTER TYPE "ListingTag" ADD VALUE 'GYM_ACCESS';
ALTER TYPE "ListingTag" ADD VALUE 'POOL_ACCESS';
ALTER TYPE "ListingTag" ADD VALUE 'PARKING';
ALTER TYPE "ListingTag" ADD VALUE 'CLEANING_INCLUDED';
ALTER TYPE "ListingTag" ADD VALUE 'NO_SMOKING';
ALTER TYPE "ListingTag" ADD VALUE 'HALAL_KITCHEN';
ALTER TYPE "ListingTag" ADD VALUE 'VISITORS_ALLOWED';
ALTER TYPE "ListingTag" ADD VALUE 'OWNER_NOT_STAYING';
ALTER TYPE "ListingTag" ADD VALUE 'NEAR_BUS_STOP';
ALTER TYPE "ListingTag" ADD VALUE 'NEAR_FOOD';
