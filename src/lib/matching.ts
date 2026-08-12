import { z } from "zod";

import { prisma } from "./prisma";
import { chatJson } from "./openrouter";
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
};

export type ListingWithProvider = Listing & {
  provider: { id: string; name: string | null; image: string | null };
  /** Ordered by `position`, so `images[0]` is the cover. */
  images: ListingImageView[];
};

export type RankedListing = {
  listing: ListingWithProvider;
  score: number;
  reason: string;
};

export type SearchResult = {
  intent: SeekerIntent;
  results: RankedListing[];
  /** Human-readable notes about constraints we had to relax to find anything. */
  relaxations: string[];
};

const MAX_CANDIDATES = 25;

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

async function runFilter(
  attempt: FilterAttempt,
  chips: ChipFilters,
): Promise<ListingWithProvider[]> {
  const { intent } = attempt;

  // Chips are explicit user choices, so they always win over the LLM guess.
  const minPrice = chips.minPrice ?? intent.minPrice;
  const maxPrice = chips.maxPrice ?? intent.maxPrice;
  const category = chips.category ?? intent.category;
  const roomType = chips.roomType ?? intent.roomType;

  const where: Record<string, unknown> = { status: "ACTIVE" };

  if (minPrice != null || maxPrice != null) {
    where.price = {
      ...(minPrice != null ? { gte: minPrice } : {}),
      ...(maxPrice != null
        ? { lte: Math.round(maxPrice * (1 + attempt.pricePadding)) }
        : {}),
    };
  }
  if (category) where.category = category;
  if (roomType) where.roomType = roomType;
  if (attempt.useMustHaveTags && intent.mustHaveTags.length > 0) {
    where.tags = { hasEvery: intent.mustHaveTags };
  }

  const listings = await prisma.listing.findMany({
    where,
    include: {
      provider: { select: { id: true, name: true, image: true } },
      images: LISTING_IMAGE_SELECT,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

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
 */
export async function hardFilter(
  intent: SeekerIntent,
  chips: ChipFilters,
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
    const listings = await runFilter(attempt, chips);
    if (listings.length > 0) {
      if (attempt.note) relaxations.push(attempt.note);
      return { listings, relaxations };
    }
    if (attempt.note) relaxations.push(attempt.note);
  }

  return { listings: [], relaxations: [] };
}

// ---------------------------------------------------------------------------
// Layer 2: LLM ranking with a one-line explanation per listing
// ---------------------------------------------------------------------------

const rankingSchema = z.object({
  ranking: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      reason: z.string(),
    }),
  ),
});

const RANK_SYSTEM_PROMPT = `You rank room listings for a student looking for housing near NTU Singapore.

You get the seeker's request and a numbered list of candidate listings that ALREADY passed the hard filters (budget, tags, category). Your job is to order them by how well they fit the seeker's stated preferences and the nuance in their wording.

Return ONLY JSON:
{"ranking": [{"id": "<listing id>", "score": <0-100>, "reason": "<max 18 words>"}]}

Rules:
- Include EVERY candidate id exactly once, best fit first.
- reason must be concrete and specific to that listing: cite the budget fit, the commute, a tag, or a phrase from the description. Write it addressed to the seeker, e.g. "Within budget, 17 min by bus, landlord mentions keeping the flat quiet".
- Never invent facts that are not in the listing data.
- ON_CAMPUS listings are already on campus, so their commute is 0 by definition. Do NOT rank them highly just for being close - judge them on price, room type, tags and description like anything else.
- Prefer listings whose description genuinely reflects the seeker's nuance over ones that merely have the right tags.`;

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
    // Truncated to keep one ranking call cheap and fast.
    description: l.description.slice(0, 400),
  }));
}

/** Throws if OpenRouter is unreachable - the caller renders an error state. */
export async function rankListings(
  intent: SeekerIntent,
  listings: ListingWithProvider[],
  originalQuery: string,
): Promise<RankedListing[]> {
  if (listings.length === 0) return [];

  // Browsing with an empty search bar: there is nothing to rank against, and
  // the results page hides reasons and rank numbers without a query. Ranking
  // here would spend an LLM call and its latency on output that is discarded,
  // so keep the query order (newest first) instead.
  if (!originalQuery.trim() && !intent.nuance.trim()) {
    return listings.map((listing) => ({ listing, score: 0, reason: "" }));
  }

  const candidates = listings.slice(0, MAX_CANDIDATES);
  const overflow = listings.slice(MAX_CANDIDATES);

  const raw = await chatJson<unknown>({
    system: RANK_SYSTEM_PROMPT,
    user: JSON.stringify({
      seekerQuery: originalQuery,
      seekerNuance: intent.nuance,
      budget: { min: intent.minPrice, max: intent.maxPrice },
      preferredTravelMode: intent.travelMode ?? "transit",
      niceToHave: intent.niceToHaveTags,
      candidates: candidatePayload(candidates, intent),
    }),
    maxTokens: 2000,
  });

  const parsed = rankingSchema.parse(raw);
  const byId = new Map(candidates.map((l) => [l.id, l]));
  const ranked: RankedListing[] = [];
  const seen = new Set<string>();

  for (const entry of parsed.ranking) {
    const listing = byId.get(entry.id);
    if (!listing || seen.has(entry.id)) continue;
    seen.add(entry.id);
    ranked.push({
      listing,
      score: clampScore(entry.score),
      reason: entry.reason.trim(),
    });
  }

  // Listings the model dropped, plus everything past MAX_CANDIDATES that was
  // never sent to it, still deserve to appear - just below the ranked ones and
  // without an invented reason. They keep their query order (newest first).
  const unranked = [...candidates.filter((l) => !seen.has(l.id)), ...overflow];
  ranked.push(
    ...unranked.map((listing) => ({ listing, score: 0, reason: "" })),
  );

  return ranked;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function searchListings(
  query: string,
  chips: ChipFilters,
): Promise<SearchResult> {
  const intent = await parseSeekerQuery(query);
  const { listings, relaxations } = await hardFilter(intent, chips);
  const results = await rankListings(intent, listings, query);
  return { intent, results, relaxations };
}
