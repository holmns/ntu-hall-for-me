-- pgvector backs the semantic ordering in search. Supabase ships the extension
-- but does not enable it per project, so create it here rather than expecting
-- someone to click it in the dashboard before deploying.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "embedding" vector(1536),
ADD COLUMN     "embeddingModel" TEXT,
ADD COLUMN     "embeddedAt" TIMESTAMP(3);

-- HNSW over cosine distance, matching the <=> operator used by the search
-- query. Not needed for correctness at demo volume, where a sequential scan
-- over a few hundred rows is faster than the index, but it is what keeps the
-- ORDER BY sublinear as listings grow.
CREATE INDEX "Listing_embedding_idx" ON "Listing" USING hnsw ("embedding" vector_cosine_ops);
