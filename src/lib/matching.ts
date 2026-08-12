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

/** Listing id -> the one-line explanation shown on its card. */
export type ReasonMap = Map<string, string>;

export type SearchResult = {
  intent: SeekerIntent;
  listings: ListingWithProvider[];
  /**
   * Reasons for the first REASON_LIMIT listings, deliberately NOT awaited by
   * `searchListings`. The results page renders the list from the database
   * order and lets this resolve into per-card Suspense boundaries, so the one
   * slow LLM call never delays the rooms themselves.
   */
  reasons: Promise<ReasonMap>;
  /** Human-readable notes about constraints we had to relax to find anything. */
  relaxations: string[];
};

/**
 * How many listings get a written reason. Reasons are the expensive part of the
 * pipeline: the model emits ~45 tokens per listing and LLM latency is dominated
 * by generation, so asking for 10 instead of every result is most of the cost.
 * Cards past this render without one, exactly as they already do today.
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

const REASON_SYSTEM_PROMPT = `You explain why each room listing fits a student looking for housing near NTU Singapore.

You get the seeker's request and the listings that were shown to them, already filtered and already in their final display order. Do NOT reorder them and do not judge which is best - write one short explanation per listing.

Return ONLY JSON:
{"reasons": [{"id": "<listing id>", "reason": "<max 18 words>"}]}

Rules:
- Include EVERY listing id exactly once, in the order you received them.
- reason must be concrete and specific to that listing: cite the budget fit, the commute, a tag, or a phrase from the description. Write it addressed to the seeker, e.g. "Within budget, 17 min by bus, landlord mentions keeping the flat quiet".
- Never invent facts that are not in the listing data.
- ON_CAMPUS listings are already on campus, so their commute is 0 by definition. Say so plainly rather than describing it as a short trip.
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
 * One LLM call for the first REASON_LIMIT listings. Rejects if OpenRouter is
 * unreachable; the caller decides what a failed reason looks like, because by
 * then the rooms are already on screen and taking the page down over a missing
 * caption would be worse than the caption.
 */
export async function generateReasons(
  intent: SeekerIntent,
  listings: ListingWithProvider[],
  originalQuery: string,
): Promise<ReasonMap> {
  // Browsing with an empty search bar: there is no request to explain a fit
  // against, and the results page hides reasons without a query. Skip the call
  // rather than spend its latency on output that is discarded.
  if (listings.length === 0 || (!originalQuery.trim() && !intent.nuance.trim())) {
    return new Map();
  }

  const described = listings.slice(0, REASON_LIMIT);

  const raw = await chatJson<unknown>({
    system: REASON_SYSTEM_PROMPT,
    user: JSON.stringify({
      seekerQuery: originalQuery,
      seekerNuance: intent.nuance,
      budget: { min: intent.minPrice, max: intent.maxPrice },
      preferredTravelMode: intent.travelMode ?? "transit",
      niceToHave: intent.niceToHaveTags,
      listings: candidatePayload(described, intent),
    }),
    // REASON_LIMIT entries at ~45 tokens each, with headroom.
    maxTokens: 800,
  });

  const parsed = reasonsSchema.parse(raw);
  const known = new Set(described.map((l) => l.id));
  const reasons: ReasonMap = new Map();

  for (const entry of parsed.reasons) {
    const reason = entry.reason.trim();
    // Ignore ids the model invented or repeated. A listing the model skips
    // simply renders without a reason, which the card already handles.
    if (!known.has(entry.id) || reasons.has(entry.id) || !reason) continue;
    reasons.set(entry.id, reason);
  }

  return reasons;
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
  const intent = await parseSeekerQuery(query);
  const { listings, relaxations } = await hardFilter(intent, chips);
  const reasons = generateReasons(intent, listings, query);
  return { intent, listings, reasons, relaxations };
}
