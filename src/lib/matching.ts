import { z } from "zod";

import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import { chatJson, chatStream, extractJson } from "./openrouter";
import { areaBounds, isInsideArea, type AreaPoint } from "./area-filter";
import { embedText, toVectorLiteral } from "./embeddings";
import { ALL_TAGS, TAG_LABELS } from "./constants";
import { LISTING_IMAGE_SELECT, type ListingImageView } from "./images";
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "@/generated/prisma/enums";
import type { ListingModel as Listing } from "@/generated/prisma/models";

export type TravelMode = "walking" | "transit" | "driving";

/** Structured form of the seeker's natural-language query (layer 1 output). */
export type SeekerIntent = {
  minPrice: number | null;
  maxPrice: number | null;
  mustHaveTags: ListingTag[];
  niceToHaveTags: ListingTag[];
  category: ListingCategory | null;
  roomType: RoomType | null;
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
  travelMode: z.enum(["walking", "transit", "driving"]).nullable().optional(),
  maxCommuteMin: z.number().nullable().optional(),
  nuance: z.string().optional(),
  summary: z.string().optional(),
});

function buildParseSystemPrompt(): string {
  const tagLines = ALL_TAGS.map((t) => `- ${t}: ${TAG_LABELS[t]}`).join("\n");
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
- "near campus" / "close to NTU" is a commute preference, not a category. Only set category when the seeker explicitly means NTU hall/on-campus or explicitly means outside campus.
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
    travelMode: null,
    maxCommuteMin: null,
    nuance: "",
    summary: "All available rooms",
  };
}

/** Throws if OpenRouter is unreachable - the caller renders an error state. */
export async function parseSeekerQuery(query: string): Promise<SeekerIntent> {
  const trimmed = query.trim();
  if (!trimmed) return browseAllIntent();

  const raw = await chatJson<unknown>({
    system: buildParseSystemPrompt(),
    user: trimmed,
    maxTokens: 600,
  });
  const parsed = intentSchema.parse(raw);
  const validTags = new Set<string>(ALL_TAGS);
  const clean = (tags?: string[]) =>
    (tags ?? [])
      .map((t) => t.toUpperCase().trim())
      .filter((t): t is ListingTag => validTags.has(t));

  const mustHaveTags = clean(parsed.mustHaveTags);
  const niceToHaveTags = clean(parsed.niceToHaveTags).filter(
    (t) => !mustHaveTags.includes(t),
  );

  return groundIntent(
    {
      minPrice: normalisePrice(parsed.minPrice),
      maxPrice: normalisePrice(parsed.maxPrice),
      mustHaveTags,
      niceToHaveTags,
      category: parsed.category ?? null,
      roomType: parsed.roomType ?? null,
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

  return {
    ...intent,
    minPrice: mentionsNumber ? intent.minPrice : null,
    maxPrice: mentionsNumber ? intent.maxPrice : null,
    maxCommuteMin: mentionsDuration ? intent.maxCommuteMin : null,
    category: mentionsCategory ? intent.category : null,
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

const REASON_SYSTEM_PROMPT = `You rank and explain room listings for a student looking for housing near NTU Singapore.

You get the seeker's request and a shortlist that already passed the hard filters (budget, tags, category) and was pre-sorted by how closely each description matches the request. Semantic similarity alone cannot weigh price against commute, so that judgement is yours.

Return ONLY JSON, with "order" FIRST:
{"order": ["<id best first>", ...], "reasons": [{"id": "<listing id>", "reason": "<max 18 words>"}]}

Emitting "order" before "reasons" is required, not stylistic: the page renders as soon as the order arrives and fills the explanations in afterwards.

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

  const reasons = (async (): Promise<ReasonMap> => {
    let buffer = "";
    let orderSettled = false;

    try {
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
        // The order array plus REASON_LIMIT entries at ~45 tokens each.
        maxTokens: 1000,
      })) {
        buffer += delta;

        if (orderSettled) continue;
        const fragment = buffer.match(ORDER_FRAGMENT);
        if (!fragment) continue;

        try {
          const parsed = JSON.parse(`[${fragment[1]}]`) as unknown;
          const ranked = Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === "string")
            : [];
          // Anything the model dropped keeps its vector position at the end,
          // so a short or invented order cannot lose a room.
          const seen = new Set(ranked.filter((id) => known.has(id)));
          resolveOrder([...seen, ...ids.filter((id) => !seen.has(id))]);
        } catch {
          // Not valid JSON yet; keep reading.
          continue;
        }
        orderSettled = true;
      }
    } catch (error) {
      // The order is what the page is blocked on, so it must settle either way.
      if (!orderSettled) rejectOrder(error);
      throw error;
    }

    // A stream that ended without a usable order leaves the vector order.
    if (!orderSettled) resolveOrder(ids);

    const parsed = reasonsSchema.parse(extractJson<unknown>(buffer));
    const map: ReasonMap = new Map();
    for (const entry of parsed.reasons) {
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

  // The embedding does not depend on the parse, so the two calls overlap
  // instead of queueing. Browsing with an empty bar does neither.
  const [intent, queryVector] = await Promise.all([
    parseSeekerQuery(query),
    trimmed ? embedText(trimmed) : Promise.resolve(null),
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
  reasons.catch(() => {});

  // With an explicit sort the model's order is discarded and SQL's is kept:
  // reordering rooms the seeker asked to see cheapest-first would be the
  // control not working. Nothing to wait for either, so the rooms render as
  // soon as the database answers rather than after ~120 streamed tokens.
  //
  // The reasons are still shown. "Why this room matches" is worth reading
  // whatever order the rooms are in, and it costs nothing extra: order and
  // reasons come from one streamed call, and only the order is being dropped.
  if (chips.sort) {
    order.catch(() => {});
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
