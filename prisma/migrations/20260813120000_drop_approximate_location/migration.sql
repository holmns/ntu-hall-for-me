-- Listings now publish their exact location. The jittered public coordinates
-- and the display circle they fed are gone, so the columns go with them.
--
-- Hand-written rather than generated: `prisma migrate diff` cannot see
-- `Listing_embedding_idx` (it is an HNSW index on the Unsupported vector
-- column) and proposes dropping it alongside these two columns.
ALTER TABLE "Listing" DROP COLUMN "approxLat",
DROP COLUMN "approxLng";
