import { z } from "zod";

import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  chatJson,
  chatStream,
  extractJson,
  UnparseableOutputError,
  withJsonRetries,
} from "./openrouter";
import { areaBounds, isInsideArea, type AreaPoint } from "./area-filter";
import { embedText, toVectorLiteral } from "./embeddings";
import { ALL_TAGS, OPPOSING_TAGS, TAG_LABELS } from "./constants";
import { LISTING_IMAGE_SELECT, type ListingImageView } from "./images";
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "@/generated/prisma/enums";
import type { ListingModel as Listing } from "@/generated/prisma/models";

export type TravelMode = "walking" | "transit" | "driving";

/** The seeker's own gender, when they state it. Not a tag - see `SeekerIntent`. */
export type SeekerGender = "male" | "female";

/** The tag that closes a room to a seeker of each gender. */
const EXCLUDED_BY_GENDER: Record<SeekerGender, ListingTag> = {
  male: "FEMALE_ONLY",
  female: "MALE_ONLY",
};

/** Tags that say who a room accepts. Handled by `seekerGender`, not as tags. */
const GENDER_TAGS = new Set<string>([
  "FEMALE_ONLY",
  "MALE_ONLY",
  "ANY_GENDER",
] satisfies ListingTag[]);

/** Structured form of the seeker's natural-language query (layer 1 output). */
export type SeekerIntent = {
  minPrice: number | null;
  maxPrice: number | null;
  mustHaveTags: ListingTag[];
  niceToHaveTags: ListingTag[];
  category: ListingCategory | null;
  roomType: RoomType | null;
  /**
   * Whose gender the seeker stated about themselves, not a tag they asked for.
   *
   * Gender is the one constraint the tag lists cannot carry, because it is a
   * disjunction and `mustHaveTags` is an AND: a man fits a MALE_ONLY room *or*
   * an ANY_GENDER one *or* one with no gender tag at all, and asking for two of
   * those at once matched nothing. Kept as its own field so `runFilter` can
   * express it as the exclusion it really is - see `EXCLUDED_BY_GENDER`.
   */
  seekerGender: SeekerGender | null;
  travelMode: TravelMode | null;
  maxCommuteMin: number | null;
  /** Free-text nuance that cannot be expressed as a tag ("chill landlord"). */
  nuance: string;
  /** One-line restatement shown back to the seeker. */
  summary: string;
};

/** Hard constraints set explicitly via filter chips. These beat the LLM. */
export type ChipFilters = {
  minPrice?: number | null;
  maxPrice?: number | null;
  category?: ListingCategory | null;
  roomType?: RoomType | null;
  /**
   * Amenities the seeker ticked. Every listing must have all of them, and
   * unlike the model's `mustHaveTags` these are never demoted to preferences:
   * the relaxation ladder only ever loosens things the model guessed at.
   */
  tags?: ListingTag[] | null;
  /**
   * Ceiling on the commute to NTU, in minutes, measured in `commuteMode`.
   * Reads the columns cached at write time - search never calls a Maps API.
   * Never relaxed, for the same reason as `tags`.
   */
  maxCommuteMin?: number | null;
  /** Which cached column `maxCommuteMin` is compared against. */
  commuteMode?: TravelMode | null;
  /**
   * A boundary the seeker drew on the map. Never relaxed - see `hardFilter`.
   */
  area?: AreaPoint[] | null;
  /**
   * Explicit ordering. Null is "best match", which is the vector shortlist
   * reordered by the model - the app's whole pitch, and so the default.
   * Anything else takes the ordering away from both and does it in SQL.
   */
  sort?: SortOrder | null;
};

/**
 * The orderings offered beside "best match".
 *
 * Deliberately small and all expressible in SQL: none of them costs an LLM
 * call, so a seeker who just wants the cheapest room gets it without paying
 * for a ranking they are about to override.
 */
export type SortOrder = "price_asc" | "price_desc" | "newest";

export type ListingWithProvider = Listing & {
  provider: { id: string; name: string | null; image: string | null };
  /** Ordered by `position`, so `images[0]` is the cover. */
  images: ListingImageView[];
};

/** Listing id -> the one-line explanation shown on its card. */
export type ReasonMap = Map<string, string>;

export type SearchResult = {
  intent: SeekerIntent;
  /** Already in final display order: the shortlist reranked, then the tail. */
  listings: ListingWithProvider[];
  /**
   * Reasons for the first REASON_LIMIT listings, deliberately NOT awaited by
   * `searchListings`. They arrive from the same streamed call that produced the
   * order, but hundreds of tokens later, so the page renders the rooms and lets
   * this resolve into per-card Suspense boundaries.
   */
  reasons: Promise<ReasonMap>;
  /** Human-readable notes about constraints we had to relax to find anything. */
  relaxations: string[];
};

/**
 * How many listings the model reranks and explains. Generation dominates LLM
 * latency and each listing costs ~45 tokens of explanation, so this is the main
 * cost dial. Rooms past it keep their vector position and render without a
 * reason, which the card already handles.
 */
export const REASON_LIMIT = 10;

// ---------------------------------------------------------------------------
// Layer 1: natural language -> structured filters
// ---------------------------------------------------------------------------

const intentSchema = z.object({
  minPrice: z.number().nullable().optional(),
  maxPrice: z.number().nullable().optional(),
  mustHaveTags: z.array(z.string()).optional(),
  niceToHaveTags: z.array(z.string()).optional(),
  category: z.enum(["ON_CAMPUS", "OFF_CAMPUS"]).nullable().optional(),
  roomType: z.enum(["SINGLE", "SHARED", "WHOLE_UNIT"]).nullable().optional(),
  seekerGender: z.enum(["male", "female"]).nullable().optional(),
  travelMode: z.enum(["walking", "transit", "driving"]).nullable().optional(),
  maxCommuteMin: z.number().nullable().optional(),
  nuance: z.string().optional(),
  summary: z.string().optional(),
});

function buildParseSystemPrompt(): string {
  const tagLines = ALL_TAGS.map((t) => `- ${t}: ${TAG_LABELS[t]}`).join("\n");
  const opposites = OPPOSING_TAGS.map(([a, b]) => `${a}/${b}`).join(", ");
  return `You extract structured housing search filters from a student's natural-language request.

Context: students looking for rooms near Nanyang Technological University (NTU) in west Singapore. Prices are monthly rent in SGD.

Return ONLY a JSON object with these keys:
{
  "minPrice": number | null,
  "maxPrice": number | null,
  "mustHaveTags": string[],
  "niceToHaveTags": string[],
  "category": "ON_CAMPUS" | "OFF_CAMPUS" | null,
  "roomType": "SINGLE" | "SHARED" | "WHOLE_UNIT" | null,
  "seekerGender": "male" | "female" | null,
  "travelMode": "walking" | "transit" | "driving" | null,
  "maxCommuteMin": number | null,
  "nuance": string,
  "summary": string
}

Tags must come from this exact list (use the UPPER_SNAKE names, no others):
${tagLines}

Rules:
- mustHaveTags: only things the seeker clearly requires. Be conservative - a wrong must-have removes good listings entirely. When in doubt put it in niceToHaveTags.
- "don't mind sharing" or "ok with sharing" is NOT a requirement for SHARED. Leave roomType null.
- These are opposites, so never return both of a pair anywhere: ${opposites}. Pick the one the seeker asked for and leave the other out entirely.
- "near campus" / "close to NTU" is a commute preference, not a category. Only set category when the seeker explicitly means NTU hall/on-campus or explicitly means outside campus.
- seekerGender: set it only when the seeker says which gender THEY are ("I'm a guy", "female student"). Null otherwise, including when they only mention a preference about housemates.
- Never put FEMALE_ONLY, MALE_ONLY or ANY_GENDER in mustHaveTags or niceToHaveTags. Those describe who a room accepts, and seekerGender already handles it: a male seeker fits male-only rooms AND rooms open to any gender, which no single must-have tag can say.
- nuance: short phrase capturing preferences that are not tags, e.g. "quiet, studious, relaxed landlord". Empty string if none.
- summary: one short sentence restating the request in plain English.
- Never invent a budget the seeker did not state.`;
}

/**
 * Neutral intent for browsing with an empty search bar. Nothing to parse, so
 * this is the one path into the pipeline that does not call the model.
 */
function browseAllIntent(): SeekerIntent {
  return {
    minPrice: null,
    maxPrice: null,
    mustHaveTags: [],
    niceToHaveTags: [],
    category: null,
    roomType: null,
    seekerGender: null,
    travelMode: null,
    maxCommuteMin: null,
    nuance: "",
    summary: "All available rooms",
  };
}

/** Throws if OpenRouter is unreachable - the caller renders an error state. */
/**
 * Parsed intents, keyed by the exact query text.
 *
 * The same sentence always produces the same reading - one prompt, one model,
 * and `groundIntent` is pure - so parsing it twice is a paid round trip for an
 * answer already known. Worth caching because a query is almost never parsed
 * once: choosing a sort, ticking a filter, drawing a boundary and the back
 * button all re-run the pipeline over the same words, and each of those was
 * waiting on the model to repeat itself.
 *
 * Per process and best effort. A cold start, or a second instance, simply
 * parses again - which is exactly the behaviour this replaces, so there is
 * nothing to be correct about beyond not growing without bound.
 *
 * Safe to hand the same object to every caller: nothing downstream mutates an
 * intent. `hardFilter` expresses its relaxation ladder as flags on each
 * attempt rather than by editing the intent it was given.
 */
const INTENT_CACHE_MAX = 200;
const intentCache = new Map<string, SeekerIntent>();

function rememberIntent(query: string, intent: SeekerIntent): void {
  intentCache.set(query, intent);
  if (intentCache.size <= INTENT_CACHE_MAX) return;
  // Map iterates in insertion order, so the first key is the coldest.
  const oldest = intentCache.keys().next().value;
  if (oldest !== undefined) intentCache.delete(oldest);
}

export async function parseSeekerQuery(query: string): Promise<SeekerIntent> {
  const trimmed = query.trim();
  if (!trimmed) return browseAllIntent();

  const cached = intentCache.get(trimmed);
  if (cached) {
    // Re-inserted so the map stays ordered least-recently-used first.
    intentCache.delete(trimmed);
    intentCache.set(trimmed, cached);
    return cached;
  }

  // The schema check lives inside the retry, not after it: an object of the
  // wrong shape is the same failure as one that would not parse, and the same
  // ask again is the fix. Only unparseable output is retried - a missing key or
  // a dead model ID fails identically the second time, so it goes straight to
  // the error page rather than costing two more round trips first.
  const parsed = await withJsonRetries(
    "parse seeker query",
    async ({ temperature }) => {
      const raw = await chatJson<unknown>({
        system: buildParseSystemPrompt(),
        user: trimmed,
        maxTokens: 600,
        temperature,
      });
      const result = intentSchema.safeParse(raw);
      if (!result.success) {
        throw new UnparseableOutputError(
          `intent JSON did not match the schema: ${result.error.message.slice(0, 200)}`,
        );
      }
      return result.data;
    },
  );
  const validTags = new Set<string>(ALL_TAGS);
  // Gender rides on `seekerGender`, never on a tag list. Dropped here rather
  // than trusted to the prompt, because a MALE_ONLY must-have would filter out
  // the 25 rooms open to any gender and an ANY_GENDER one would filter out the
  // male-only rooms - both readings of the same sentence delete good listings.
  const clean = (tags?: string[]) =>
    (tags ?? [])
      .map((t) => t.toUpperCase().trim())
      .filter((t): t is ListingTag => validTags.has(t) && !GENDER_TAGS.has(t));

  const { mustHaveTags, niceToHaveTags } = demoteOpposites(
    clean(parsed.mustHaveTags),
    clean(parsed.niceToHaveTags),
  );

  const intent = groundIntent(
    {
      minPrice: normalisePrice(parsed.minPrice),
      maxPrice: normalisePrice(parsed.maxPrice),
      mustHaveTags,
      niceToHaveTags,
      category: parsed.category ?? null,
      roomType: parsed.roomType ?? null,
      seekerGender: parsed.seekerGender ?? null,
      travelMode: parsed.travelMode ?? null,
      maxCommuteMin:
        typeof parsed.maxCommuteMin === "number" && parsed.maxCommuteMin > 0
          ? Math.round(parsed.maxCommuteMin)
          : null,
      nuance: parsed.nuance?.trim() ?? "",
      summary: parsed.summary?.trim() || trimmed,
    },
    trimmed,
  );

  // Only a successful parse. A transient model failure throws, and caching it
  // would poison that query for the life of the process.
  rememberIntent(trimmed, intent);
  return intent;
}

/**
 * Moves any pair of opposing tags out of the must-have list, and dedupes what
 * is left against it.
 *
 * `hardFilter` requires every must-have at once, so QUIET plus SOCIAL matches
 * nothing before the relaxation ladder is ever consulted - and unlike an
 * over-eager single tag, no listing could ever satisfy the pair. The prompt
 * already forbids it; this is what holds when the model does it anyway.
 *
 * Both members are demoted rather than one being chosen, because which one the
 * seeker meant is precisely what just went wrong. As preferences they still
 * reach the reranker, which reads `niceToHave` when it orders the shortlist and
 * writes the reasons, so the vibe still counts - it just stops deleting rows.
 */
function demoteOpposites(
  mustHave: ListingTag[],
  niceToHave: ListingTag[],
): { mustHaveTags: ListingTag[]; niceToHaveTags: ListingTag[] } {
  const demoted = new Set<ListingTag>(
    OPPOSING_TAGS.filter(
      ([a, b]) => mustHave.includes(a) && mustHave.includes(b),
    ).flat(),
  );
  const mustHaveTags = mustHave.filter((tag) => !demoted.has(tag));

  return {
    mustHaveTags,
    niceToHaveTags: [...new Set([...niceToHave, ...demoted])].filter(
      (tag) => !mustHaveTags.includes(tag),
    ),
  };
}

/**
 * Drops model-inferred HARD constraints that are not actually grounded in the
 * seeker's words.
 *
 * Real models over-constrain: "quiet room near campus" came back as
 * category=OFF_CAMPUS plus a 15-minute *walking* limit, which excluded every
 * on-campus hall (the closest listings of all) and cut 20 rooms down to 1.
 * The seeker said none of that. Anything left null here still influences
 * ranking through `nuance`, it just stops silently deleting listings.
 */
export function groundIntent(intent: SeekerIntent, query: string): SeekerIntent {
  const q = query.toLowerCase();

  const mentionsNumber = /\d/.test(q);
  const mentionsDuration = /\d+\s*(min|minute|hr|hour)/.test(q);
  // "near campus" must NOT count as a category signal.
  const mentionsCategory =
    /on[- ]?campus|off[- ]?campus|\bhalls?\b|\bdorm|\bhostel|\bsublet/.test(q);
  const mentionsTravelMode =
    /walk|bus\b|mrt|transit|public transport|driv|\bcar\b|cycl|\bbike/.test(q);
  // The seeker's gender excludes rooms, so it needs a word for it in the
  // query. Nothing else in a housing request implies one, and a model that
  // infers it from a name or a "girls' hall" mention would be filtering on a
  // fact the seeker never gave.
  const mentionsGender =
    /\b(male|males|female|females|man|men|woman|women|guy|guys|boy|boys|girl|girls|gentleman|lady|ladies|he|him|his|she|her|hers|son|daughter|brother|sister|mr|ms|mrs|miss)\b/.test(
      q,
    );

  return {
    ...intent,
    minPrice: mentionsNumber ? intent.minPrice : null,
    maxPrice: mentionsNumber ? intent.maxPrice : null,
    maxCommuteMin: mentionsDuration ? intent.maxCommuteMin : null,
    category: mentionsCategory ? intent.category : null,
    seekerGender: mentionsGender ? intent.seekerGender : null,
    travelMode: mentionsTravelMode ? intent.travelMode : null,
  };
}

function normalisePrice(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Layer 1b: hard filter (with relaxation so the demo never dead-ends)
// ---------------------------------------------------------------------------

type FilterAttempt = {
  intent: SeekerIntent;
  useMustHaveTags: boolean;
  pricePadding: number;
  ignoreCommute: boolean;
  note: string | null;
};

/** Hard cap on rows pulled per attempt, before the commute filter. */
const MAX_ROWS = 100;

/**
 * Filtering and ordering both live in this one SQL statement, because Prisma
 * cannot express `<=>` against the Unsupported vector column and splitting the
 * two would leave the budget filter and the ordering as separate sources of
 * truth. The rows are then hydrated through Prisma so the provider and image
 * selects stay in one place.
 *
 * `queryVector` is null when the search bar is empty, which is the only case
 * where recency is the right order: there is no request to be similar to.
 */
/** One clause per offered sort. Written out so nothing user-supplied reaches SQL. */
const SORT_SQL: Record<SortOrder, Prisma.Sql> = {
  price_asc: Prisma.sql`ORDER BY "price" ASC, "createdAt" DESC`,
  price_desc: Prisma.sql`ORDER BY "price" DESC, "createdAt" DESC`,
  newest: Prisma.sql`ORDER BY "createdAt" DESC`,
};

async function runFilter(
  attempt: FilterAttempt,
  chips: ChipFilters,
  queryVector: number[] | null,
): Promise<ListingWithProvider[]> {
  const { intent } = attempt;

  // Chips are explicit user choices, so they always win over the LLM guess.
  const minPrice = chips.minPrice ?? intent.minPrice;
  const maxPrice = chips.maxPrice ?? intent.maxPrice;
  const category = chips.category ?? intent.category;
  const roomType = chips.roomType ?? intent.roomType;

  const conditions = [Prisma.sql`"status" = 'ACTIVE'`];
  if (minPrice != null) {
    conditions.push(Prisma.sql`"price" >= ${minPrice}`);
  }
  if (maxPrice != null) {
    conditions.push(
      Prisma.sql`"price" <= ${Math.round(maxPrice * (1 + attempt.pricePadding))}`,
    );
  }
  if (category) {
    conditions.push(Prisma.sql`"category"::text = ${category}`);
  }
  if (roomType) {
    conditions.push(Prisma.sql`"roomType"::text = ${roomType}`);
  }
  if (attempt.useMustHaveTags && intent.mustHaveTags.length > 0) {
    // Compared as text[] so the enum does not have to be cast on the way in.
    conditions.push(
      Prisma.sql`"tags"::text[] @> ${intent.mustHaveTags}::text[]`,
    );
  }
  // Gender is an exclusion, not a requirement: a man is turned away by a
  // FEMALE_ONLY room and welcome in everything else, whether it is tagged
  // MALE_ONLY, ANY_GENDER or not tagged at all. Absence of a restriction is
  // not a restriction, so this must not be written as a positive match.
  //
  // Never relaxed, unlike the must-have tags below it. The ladder loosens
  // guesses to avoid an empty page; a room whose provider will not rent to
  // this seeker is not a match worth showing to fill one.
  if (intent.seekerGender) {
    conditions.push(
      Prisma.sql`NOT ("tags"::text[] @> ARRAY[${EXCLUDED_BY_GENDER[intent.seekerGender]}]::text[])`,
    );
  }
  // Outside the relaxation gate above on purpose. The ladder only ever loosens
  // what the model guessed at; a tag the seeker ticked themselves is not a
  // guess, and quietly returning rooms without it would make the panel a lie.
  if (chips.tags && chips.tags.length > 0) {
    conditions.push(Prisma.sql`"tags"::text[] @> ${chips.tags}::text[]`);
  }
  // Bounding box only. It is what SQL can do cheaply and it is enough to keep
  // the row count down; the exact point-in-polygon test runs below, once, on
  // the rows that survive.
  if (chips.area) {
    const box = areaBounds(chips.area);
    conditions.push(
      Prisma.sql`"lat" BETWEEN ${box.south} AND ${box.north} AND "lng" BETWEEN ${box.west} AND ${box.east}`,
    );
  }

  // An explicit sort replaces the vector ordering outright rather than
  // breaking ties within it: someone who asked for cheapest first wants the
  // cheapest room, not the cheapest of whatever the embedding liked. Price
  // ties break on recency so the order is stable between identical searches.
  //
  // Otherwise, NULLS LAST is load-bearing: a listing whose embedding failed or
  // has not been backfilled yet still has to appear, just below everything
  // that can be compared. Dropping it would make rows silently vanish.
  const order = chips.sort
    ? SORT_SQL[chips.sort]
    : queryVector
      ? Prisma.sql`ORDER BY "embedding" <=> ${toVectorLiteral(queryVector)}::vector ASC NULLS LAST, "createdAt" DESC`
      : Prisma.sql`ORDER BY "createdAt" DESC`;

  const ordered = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Listing"
    WHERE ${Prisma.join(conditions, " AND ")}
    ${order}
    LIMIT ${MAX_ROWS}
  `;
  if (ordered.length === 0) return [];

  const ids = ordered.map((row) => row.id);
  const rows = await prisma.listing.findMany({
    where: { id: { in: ids } },
    include: {
      provider: { select: { id: true, name: true, image: true } },
      images: LISTING_IMAGE_SELECT,
    },
  });

  // `IN` does not preserve order, so restore the ranking from the first query.
  const byId = new Map(rows.map((row) => [row.id, row]));
  let listings = ids
    .map((id) => byId.get(id))
    .filter((row): row is ListingWithProvider => row != null);

  if (chips.area) {
    const area = chips.area;
    listings = listings.filter((l) => isInsideArea(l, area));
  }

  // The seeker's own commute ceiling. Applied before the model's and never
  // relaxed: `ignoreCommute` is the ladder loosening a limit the model
  // inferred, which has nothing to say about one that was ticked.
  if (chips.maxCommuteMin != null) {
    const chipMode = chips.commuteMode ?? intent.travelMode ?? "transit";
    const limit = chips.maxCommuteMin;
    listings = listings.filter(
      (l) =>
        l.category === "ON_CAMPUS" || commuteMinutes(l, chipMode) <= limit,
    );
  }

  if (attempt.ignoreCommute || intent.maxCommuteMin == null) return listings;

  const mode = intent.travelMode ?? "transit";
  return listings.filter((l) => {
    // On-campus listings are already on campus - never filter them on commute.
    if (l.category === "ON_CAMPUS") return true;
    return commuteMinutes(l, mode) <= intent.maxCommuteMin!;
  });
}

export function commuteMinutes(
  listing: Pick<
    Listing,
    "distanceWalkingMin" | "distanceTransitMin" | "distanceDrivingMin"
  >,
  mode: TravelMode,
): number {
  if (mode === "walking") return listing.distanceWalkingMin;
  if (mode === "driving") return listing.distanceDrivingMin;
  return listing.distanceTransitMin;
}

/**
 * Applies the hard filter, progressively relaxing soft-ish constraints if it
 * returns nothing. An empty result page is the worst demo outcome, and an
 * over-eager LLM must-have tag is the most likely cause.
 *
 * What is relaxed is only ever a guess the model made. A drawn boundary and
 * the filter chips are things the seeker did on purpose, so they survive every
 * attempt: quietly showing rooms outside the shape someone just drew would
 * make the drawing tool a lie.
 */
export async function hardFilter(
  intent: SeekerIntent,
  chips: ChipFilters,
  queryVector: number[] | null,
): Promise<{ listings: ListingWithProvider[]; relaxations: string[] }> {
  const attempts: FilterAttempt[] = [
    {
      intent,
      useMustHaveTags: true,
      pricePadding: 0,
      ignoreCommute: false,
      note: null,
    },
    {
      intent,
      useMustHaveTags: true,
      pricePadding: 0,
      ignoreCommute: true,
      note: "Ignored the commute limit to find matches.",
    },
    {
      intent,
      useMustHaveTags: false,
      pricePadding: 0,
      ignoreCommute: true,
      note: "Treated your must-haves as preferences instead of requirements.",
    },
    {
      intent,
      useMustHaveTags: false,
      pricePadding: 0.2,
      ignoreCommute: true,
      note: "Stretched the budget by 20% and relaxed must-haves.",
    },
  ];

  const relaxations: string[] = [];
  for (const attempt of attempts) {
    const listings = await runFilter(attempt, chips, queryVector);
    if (listings.length > 0) {
      if (attempt.note) relaxations.push(attempt.note);
      return { listings, relaxations };
    }
    if (attempt.note) relaxations.push(attempt.note);
  }

  return { listings: [], relaxations: [] };
}

// ---------------------------------------------------------------------------
// Layer 2: a one-line explanation for the listings the seeker actually sees
//
// This layer no longer decides the order. The order is the database order from
// `hardFilter`, which is where semantic (vector) ordering belongs once it
// exists - see the ORDER BY in `runFilter`. Keeping ordering out of the model
// is what lets the results page render before this call finishes: a reason
// arriving late only fills in a card, it never moves one.
// ---------------------------------------------------------------------------

const reasonsSchema = z.object({
  reasons: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
    }),
  ),
});

type ReasonEntry = { id: string; reason: string };

/**
 * Pulls every COMPLETE entry out of a "reasons" array that may be cut off.
 *
 * A response truncated by `max_tokens` is still valid JSON up to the point it
 * stopped, so it carries most of its explanations - only the entry that lost
 * its closing brace is unusable. Parsing the whole buffer or nothing throws all
 * of them away and puts an error notice on a page whose ranking is fine, which
 * is a far worse outcome for the reader than one card missing its line.
 *
 * Scans rather than regexes because a reason is free text and may itself
 * contain braces or escaped quotes.
 */
function salvageReasons(buffer: string): ReasonEntry[] {
  const key = buffer.indexOf('"reasons"');
  if (key === -1) return [];
  const open = buffer.indexOf("[", key);
  if (open === -1) return [];

  const entries: ReasonEntry[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = open + 1; i < buffer.length; i++) {
    const ch = buffer[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const entry = reasonsSchema.shape.reasons.element.safeParse(
            JSON.parse(buffer.slice(start, i + 1)),
          );
          if (entry.success) entries.push(entry.data);
        } catch {
          // Braces balanced but not valid JSON - skip this entry, keep going.
        }
        start = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }
  return entries;
}

/**
 * The whole buffer when it parsed, the complete entries when it did not.
 * Throws only when nothing at all came back - which is what makes the call
 * worth retrying, and failing that is the one case where the page's "reasons
 * unavailable" notice is the honest thing to show.
 */
function parseReasons(buffer: string): ReasonEntry[] {
  try {
    return reasonsSchema.parse(extractJson<unknown>(buffer)).reasons;
  } catch (error) {
    const salvaged = salvageReasons(buffer);
    if (salvaged.length === 0) {
      // Typed so `withJsonRetries` asks again. A zod miss on the parsed object
      // is as much a bad completion as a buffer that was never JSON.
      throw new UnparseableOutputError(
        `Could not read any reason from the model output (${buffer.length} chars): ${
          error instanceof Error ? error.message.slice(0, 200) : String(error)
        }`,
      );
    }
    console.warn(
      `[matching] reasons response was incomplete (${buffer.length} chars); kept ${salvaged.length}`,
    );
    return salvaged;
  }
}

const REASON_SYSTEM_PROMPT = `You rank and explain room listings for a student looking for housing near NTU Singapore.

You get the seeker's request and a shortlist that already passed the hard filters (budget, tags, category) and was pre-sorted by how closely each description matches the request. Semantic similarity alone cannot weigh price against commute, so that judgement is yours.

Return ONLY JSON, with "order" FIRST:
{"order": ["<id best first>", ...], "reasons": [{"id": "<listing id>", "reason": "<max 18 words>"}]}

Emitting "order" before "reasons" is required, not stylistic: the page renders as soon as the order arrives and fills the explanations in afterwards.

Emit compact JSON on a single line: no line breaks, no indentation, no space after ":" or ",". Nobody reads this JSON, and every whitespace token is one the seeker waits for.

Rules:
- "order" must contain EVERY id you were given, exactly once, best fit first.
- Weigh price, commute and how well the description answers the seeker's actual wording. Cheaper and closer is better, all else equal.
- ON_CAMPUS listings are already on campus, so their commute is 0 by definition. Do NOT rank them highly just for being close - judge them on price, room type, tags and description like anything else.
- reason must be concrete and specific to that listing: cite the budget fit, the commute, a tag, or a phrase from the description. Write it addressed to the seeker, e.g. "Within budget, 17 min by bus, landlord mentions keeping the flat quiet".
- Never invent facts that are not in the listing data.
- Prefer citing the part of the description that genuinely reflects the seeker's wording over simply listing tags.`;

function candidatePayload(
  listings: ListingWithProvider[],
  intent: SeekerIntent,
) {
  const mode = intent.travelMode ?? "transit";
  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    price: l.price,
    roomType: l.roomType,
    category: l.category,
    tags: l.tags,
    commute:
      l.category === "ON_CAMPUS"
        ? "on campus"
        : `${commuteMinutes(l, mode)} min by ${mode}`,
    // Truncated to keep the call cheap and fast.
    description: l.description.slice(0, 400),
  }));
}

/**
/** cuids contain no `]`, so the first close bracket ends the order array. */
const ORDER_FRAGMENT = /"order"\s*:\s*\[([^\]]*)\]/;

export type RerankResult = {
  /** Final display order for the shortlist. Resolves early in the stream. */
  order: Promise<string[]>;
  /** Explanations. Resolves once the whole object has arrived. */
  reasons: Promise<ReasonMap>;
};

/**
 * One streamed call that both reorders and explains the top REASON_LIMIT.
 *
 * Vector similarity picks the shortlist but cannot weigh $420 against $650 or
 * 0 minutes against 48, so the model does that. The catch is that reordering
 * after the page paints would move cards under the reader, and waiting for the
 * whole response puts ~700 tokens of explanation on the critical path.
 *
 * Streaming resolves it: the prompt puts "order" first, so the final sequence
 * is complete after ~120 tokens and the page can commit to it, while the
 * explanations keep arriving into per-card Suspense boundaries. Nothing ever
 * moves, and the wait is for the order alone.
 */
export function rerankAndExplain(
  intent: SeekerIntent,
  listings: ListingWithProvider[],
  originalQuery: string,
): RerankResult {
  const shortlist = listings.slice(0, REASON_LIMIT);
  const ids = shortlist.map((l) => l.id);

  // Browsing with an empty search bar: nothing to rank against, and the page
  // hides reasons without a query. Skip the call entirely.
  if (
    shortlist.length === 0 ||
    (!originalQuery.trim() && !intent.nuance.trim())
  ) {
    return { order: Promise.resolve(ids), reasons: Promise.resolve(new Map()) };
  }

  let resolveOrder!: (value: string[]) => void;
  let rejectOrder!: (reason: unknown) => void;
  const order = new Promise<string[]>((resolve, reject) => {
    resolveOrder = resolve;
    rejectOrder = reject;
  });

  const known = new Set(ids);
  // Outside the attempt, because the order is settled once for the whole call:
  // a retry inherits the order the first attempt already committed the page to,
  // and only re-asks for the explanations. Reasons are keyed by listing id, so
  // a second attempt's reasons fit the first attempt's order exactly.
  let orderSettled = false;

  /** True once a complete `"order":[...]` fragment has resolved the promise. */
  function settleOrderFrom(buffer: string): boolean {
    const fragment = buffer.match(ORDER_FRAGMENT);
    if (!fragment) return false;
    try {
      const parsed = JSON.parse(`[${fragment[1]}]`) as unknown;
      const ranked = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
      // Anything the model dropped keeps its vector position at the end,
      // so a short or invented order cannot lose a room.
      const seen = new Set(ranked.filter((id) => known.has(id)));
      resolveOrder([...seen, ...ids.filter((id) => !seen.has(id))]);
      return true;
    } catch {
      // Not valid JSON yet; keep reading.
      return false;
    }
  }

  /**
   * One streamed call. Settles the order mid-stream and returns the reasons
   * once the stream ends, throwing `UnparseableOutputError` when the response
   * carried no readable reason at all - which is what makes it worth re-asking.
   *
   * A merely truncated response is not a failure and never retried:
   * `parseReasons` keeps every complete entry, and paying for a whole second
   * generation to recover one missing line would be the wrong trade.
   */
  const streamOnce = async (temperature: number): Promise<ReasonEntry[]> => {
    let buffer = "";
    for await (const delta of chatStream({
      system: REASON_SYSTEM_PROMPT,
      user: JSON.stringify({
        seekerQuery: originalQuery,
        seekerNuance: intent.nuance,
        budget: { min: intent.minPrice, max: intent.maxPrice },
        preferredTravelMode: intent.travelMode ?? "transit",
        niceToHave: intent.niceToHaveTags,
        listings: candidatePayload(shortlist, intent),
      }),
      // Measured, not estimated: a full REASON_LIMIT shortlist runs 800-860
      // completion tokens pretty-printed and ~700 compact. The old 1000 left
      // barely 15% headroom, so an ordinary long-winded run hit the cap, got
      // cut mid-object and lost every reason. max_tokens is a ceiling and
      // only generated tokens are billed, so the headroom is free; it is here
      // to stop a runaway, not to trim a normal response.
      maxTokens: 1800,
      temperature,
    })) {
      buffer += delta;
      if (!orderSettled) orderSettled = settleOrderFrom(buffer);
    }
    return parseReasons(buffer);
  };

  const reasons = (async (): Promise<ReasonMap> => {
    let entries: ReasonEntry[];
    try {
      entries = await withJsonRetries(
        "rerank and explain",
        ({ temperature }) => streamOnce(temperature),
      );
    } catch (error) {
      // The order is what the page is blocked on, so it must settle either way.
      // Once an attempt has settled it the page keeps that order and only the
      // explanations are lost, which is the smaller failure of the two.
      if (!orderSettled) rejectOrder(error);
      throw error;
    }

    // A stream that ended without a usable order leaves the vector order.
    if (!orderSettled) resolveOrder(ids);

    const map: ReasonMap = new Map();
    for (const entry of entries) {
      const reason = entry.reason.trim();
      // Ignore ids the model invented or repeated. A listing the model skips
      // renders without a reason, which the card already handles.
      if (!known.has(entry.id) || map.has(entry.id) || !reason) continue;
      map.set(entry.id, reason);
    }
    return map;
  })();

  return { order, reasons };
}

/**
 * Rooms most like this one, for the foot of a listing page.
 *
 * The same vector the search pipeline orders by, compared against one stored
 * row instead of a query - so this is one round trip and costs no LLM call, no
 * embedding call and no Maps call. The comparison is done in SQL against the
 * subject's own embedding rather than reading it out first, because Prisma
 * cannot select the Unsupported vector column at all.
 *
 * Returns nothing when the subject has not been embedded. A listing with no
 * vector has no neighbours to speak of, and inventing some from price or
 * category would be a different feature wearing this one's label.
 */
export async function findSimilarListings(
  listingId: string,
  limit = 3,
): Promise<ListingWithProvider[]> {
  const ordered = await prisma.$queryRaw<{ id: string }[]>`
    SELECT l."id"
    FROM "Listing" l, "Listing" subject
    WHERE subject."id" = ${listingId}
      AND subject."embedding" IS NOT NULL
      AND l."id" <> subject."id"
      AND l."status" = 'ACTIVE'
      AND l."embedding" IS NOT NULL
    ORDER BY l."embedding" <=> subject."embedding"
    LIMIT ${limit}
  `;
  if (ordered.length === 0) return [];

  const ids = ordered.map((row) => row.id);
  const rows = await prisma.listing.findMany({
    where: { id: { in: ids } },
    include: {
      provider: { select: { id: true, name: true, image: true } },
      images: LISTING_IMAGE_SELECT,
    },
  });

  // `IN` does not preserve order, so restore it from the ranked query.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is ListingWithProvider => row != null);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Awaits everything the page needs to render rooms, and nothing else. The
 * reasons promise is returned unawaited on purpose - see `SearchResult`.
 */
export async function searchListings(
  query: string,
  chips: ChipFilters,
): Promise<SearchResult> {
  const trimmed = query.trim();

  // The vector exists to order the results. Under an explicit sort SQL does
  // the ordering and the vector is never read, so embedding the query would be
  // a paid round trip for a number nothing looks at. Worth skipping on its own
  // merits, and load-bearing now that the parse is usually cached: it is what
  // is left on the critical path once the model no longer has to be asked.
  const needsVector = trimmed.length > 0 && !chips.sort;

  // The embedding does not depend on the parse, so the two calls overlap
  // instead of queueing. Browsing with an empty bar does neither.
  const [intent, queryVector] = await Promise.all([
    parseSeekerQuery(query),
    needsVector ? embedText(trimmed) : Promise.resolve(null),
  ]);

  const { listings, relaxations } = await hardFilter(intent, chips, queryVector);
  const { order, reasons } = rerankAndExplain(intent, listings, query);

  // The one thing worth waiting for. It arrives after ~120 streamed tokens,
  // well before the explanations, and committing to it here is what lets the
  // cards render in their permanent positions.
  //
  // A failed rerank keeps the vector order rather than taking down a valid
  // result list; the reasons promise rejects with the same error and the page
  // says so. Attached before the await so the rejection is never unhandled.
  reasons.catch(() => { });

  // With an explicit sort the model's order is discarded and SQL's is kept:
  // reordering rooms the seeker asked to see cheapest-first would be the
  // control not working. Nothing to wait for either, so the rooms render as
  // soon as the database answers rather than after ~120 streamed tokens.
  //
  // The reasons are still shown. "Why this room matches" is worth reading
  // whatever order the rooms are in, and it costs nothing extra: order and
  // reasons come from one streamed call, and only the order is being dropped.
  if (chips.sort) {
    order.catch(() => { });
    return { intent, listings, reasons, relaxations };
  }

  // The one thing worth waiting for. It arrives after ~120 streamed tokens,
  // well before the explanations, and committing to it here is what lets the
  // cards render in their permanent positions.
  //
  // A failed rerank keeps the vector order rather than taking down a valid
  // result list; the reasons promise rejects with the same error and the page
  // says so. Attached before the await so the rejection is never unhandled.
  const ranked = await order.catch((error) => {
    console.error("[matching] rerank failed, keeping vector order:", error);
    return listings.slice(0, REASON_LIMIT).map((l) => l.id);
  });

  const position = new Map(ranked.map((id, index) => [id, index]));
  const shortlist = listings
    .slice(0, REASON_LIMIT)
    .sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));

  return {
    intent,
    listings: [...shortlist, ...listings.slice(REASON_LIMIT)],
    reasons,
    relaxations,
  };
}
