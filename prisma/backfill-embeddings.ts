/**
 * Embeds listings that have no vector, or whose vector came from a different
 * model. Run after adding the pgvector migration to an existing database, and
 * after changing OPENROUTER_EMBEDDING_MODEL.
 *
 *   npm run db:embed          # only rows missing a vector for the current model
 *   npm run db:embed -- --all # re-embed everything
 *
 * Safe to re-run: it selects the work it still has to do each time.
 */
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ListingTag } from "../src/generated/prisma/enums";
import {
  EMBEDDING_MODEL,
  embedTexts,
  listingEmbeddingText,
  storeListingEmbeddings,
} from "../src/lib/embeddings";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** One request per chunk. Keeps a large backfill off a single huge payload. */
const BATCH_SIZE = 50;

async function main() {
  const all = process.argv.includes("--all");

  // Raw because `embedding` is an Unsupported column and cannot be filtered on
  // through the client.
  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Listing"
    WHERE ${all}
       OR "embedding" IS NULL
       OR "embeddingModel" IS DISTINCT FROM ${EMBEDDING_MODEL}
    ORDER BY "createdAt" ASC
  `;

  if (stale.length === 0) {
    console.log(`Nothing to embed. Every listing is current for ${EMBEDDING_MODEL}.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`Embedding ${stale.length} listings with ${EMBEDDING_MODEL}...`);

  const ids = stale.map((row) => row.id);
  let done = 0;

  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const chunk = ids.slice(start, start + BATCH_SIZE);
    const listings = await prisma.listing.findMany({
      where: { id: { in: chunk } },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        roomType: true,
        price: true,
        tags: true,
      },
    });

    const vectors = await embedTexts(
      listings.map((listing) =>
        listingEmbeddingText({ ...listing, tags: listing.tags as ListingTag[] }),
      ),
    );
    await storeListingEmbeddings(
      listings.map((listing, index) => ({
        id: listing.id,
        vector: vectors[index],
      })),
    );

    done += listings.length;
    console.log(`  ${done}/${ids.length}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
