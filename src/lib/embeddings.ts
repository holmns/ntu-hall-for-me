/**
 * Semantic vectors for listings and seeker queries, via OpenRouter's
 * OpenAI-compatible /embeddings endpoint. Server-side only: it reads
 * OPENROUTER_API_KEY, the same key the chat calls use, so this adds no new
 * credential to the three the app already requires.
 *
 * There is no fallback. A missing key or a failed call throws, exactly like
 * the chat path - search would otherwise silently fall back to ordering rooms
 * by how recently they were posted, which is the behaviour vectors exist to
 * replace.
 *
 * Prisma cannot read or write `Unsupported("vector(1536)")`, so the writes here
 * go through $executeRaw and the ordering lives in `runFilter`'s $queryRaw.
 */
import { prisma } from "./prisma";
import type { ListingCategory, ListingTag, RoomType } from "@/generated/prisma/enums";
import { TAG_LABELS } from "./constants";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * 1536 dimensions. Changing this model means changing the `vector(1536)` column
 * too, and re-embedding every row: vectors from different models are not
 * comparable, and cosine distance between them is meaningless rather than
 * merely wrong. `embeddingModel` on each row is what makes a mismatch visible.
 */
export const EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || "openai/text-embedding-3-small";

export const EMBEDDING_DIMENSIONS = 1536;

export class EmbeddingError extends Error {}

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbeddingError(
      "OPENROUTER_API_KEY is not set. Search needs it to embed listings and queries - see .env.example.",
    );
  }
  return apiKey;
}

function embeddingsUrl(): string {
  const base = process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return `${base.replace(/\/$/, "")}/embeddings`;
}

/**
 * One request, many inputs. Batching matters on the seed and backfill paths,
 * where the alternative is one round trip per listing.
 */
export async function embedTexts(
  inputs: string[],
  timeoutMs = 20_000,
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(embeddingsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ntu-room-finder.local",
        "X-Title": "NTU Room Finder",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new EmbeddingError(
        `OpenRouter embeddings ${res.status}: ${body.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };
    const rows = data.data ?? [];
    if (rows.length !== inputs.length) {
      throw new EmbeddingError(
        `Expected ${inputs.length} embeddings, got ${rows.length}`,
      );
    }

    // The API documents an `index` field; do not assume response order.
    const ordered: number[][] = new Array(inputs.length);
    for (const [position, row] of rows.entries()) {
      const index = row.index ?? position;
      const vector = row.embedding;
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingError(
          `Embedding ${index} has ${vector?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}. Does OPENROUTER_EMBEDDING_MODEL match the vector() column?`,
        );
      }
      ordered[index] = vector;
    }
    return ordered;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedText(input: string): Promise<number[]> {
  const [vector] = await embedTexts([input]);
  return vector;
}

/** pgvector's text input format, e.g. `[0.1,-0.2,...]`. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * The listing text that gets embedded.
 *
 * `address`, `lat` and `lng` are deliberately absent even though they are
 * public now: proximity is already a structured filter over the cached commute
 * columns, and folding a street address into the vector only adds noise that
 * pulls "Jurong West" queries toward whatever happens to say Jurong West.
 *
 * Changing what goes in here changes the vector space, so anything added below
 * needs a `npm run db:embed` to avoid mixing old and new vectors.
 */
export function listingEmbeddingText(listing: {
  title: string;
  description: string;
  category: ListingCategory;
  roomType: RoomType;
  price: number;
  tags: ListingTag[];
}): string {
  const tags = listing.tags.map((tag) => TAG_LABELS[tag]).join(", ");
  return [
    listing.title,
    listing.description,
    `Room type: ${listing.roomType}`,
    `Location: ${listing.category === "ON_CAMPUS" ? "NTU hall, on campus" : "off campus, near NTU"}`,
    `Rent: SGD ${listing.price} per month`,
    tags ? `Features: ${tags}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Writes vectors for listings that already exist. Raw SQL because the column is
 * Unsupported, and one statement per row because pgvector wants a typed literal
 * per value; the batching that matters (the API call) already happened.
 */
export async function storeListingEmbeddings(
  rows: { id: string; vector: number[] }[],
): Promise<void> {
  if (rows.length === 0) return;

  await prisma.$transaction(
    rows.map(({ id, vector }) =>
      prisma.$executeRaw`
        UPDATE "Listing"
        SET "embedding" = ${toVectorLiteral(vector)}::vector,
            "embeddingModel" = ${EMBEDDING_MODEL},
            "embeddedAt" = NOW()
        WHERE "id" = ${id}
      `,
    ),
  );
}

/** Embeds one listing's public text and stores it. Throws on failure. */
export async function embedAndStoreListing(
  id: string,
  listing: Parameters<typeof listingEmbeddingText>[0],
): Promise<void> {
  const vector = await embedText(listingEmbeddingText(listing));
  await storeListingEmbeddings([{ id, vector }]);
}
