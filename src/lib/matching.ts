import { z } from "zod";

import { prisma } from "./prisma";
import { chatJson, hasOpenRouterKey } from "./openrouter";
import { ALL_TAGS, TAG_LABELS } from "./constants";
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
  source: "llm" | "heuristic";
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
  rankedBy: "llm" | "heuristic";
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

export async function parseSeekerQuery(query: string): Promise<SeekerIntent> {
  const trimmed = query.trim();
  if (!trimmed) return heuristicIntent("");

  if (!hasOpenRouterKey()) return heuristicIntent(trimmed);

  try {
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
        source: "llm",
      },
      trimmed,
    );
  } catch (error) {
    console.error("[matching] query parse failed, using heuristics:", error);
    return heuristicIntent(trimmed);
  }
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

/**
 * Keyword fallback so search still works with no OPENROUTER_API_KEY.
 * Deliberately simple: budget, a few tag keywords, room type, category.
 */
export function heuristicIntent(query: string): SeekerIntent {
  const q = query.toLowerCase();

  let maxPrice: number | null = null;
  let minPrice: number | null = null;

  const under = q.match(/(?:under|below|less than|max|budget of|up to|<)\s*\$?\s*(\d{3,4})/);
  if (under) maxPrice = Number(under[1]);
  const over = q.match(/(?:over|above|at least|more than|min|>)\s*\$?\s*(\d{3,4})/);
  if (over) minPrice = Number(over[1]);
  const between = q.match(/\$?\s*(\d{3,4})\s*(?:-|to|and)\s*\$?\s*(\d{3,4})/);
  if (between) {
    minPrice = Number(between[1]);
    maxPrice = Number(between[2]);
  }
  if (!maxPrice && !minPrice && !between) {
    const bare = q.match(/\$\s*(\d{3,4})/);
    if (bare) maxPrice = Number(bare[1]);
  }

  const keywordTags: [RegExp, ListingTag][] = [
    [/aircon|air-con|air con|ac\b/, "AIRCON"],
    [/ensuite|en-suite|own bathroom|attached bath|private bath/, "ENSUITE"],
    [/furnish/, "FURNISHED"],
    [/wifi|wi-fi|internet/, "WIFI_INCLUDED"],
    [/utilit|bills include/, "UTILITIES_INCLUDED"],
    [/pet|dog|cat/, "PET_FRIENDLY"],
    [/cook|kitchen/, "COOKING_ALLOWED"],
    [/washing machine|laundry/, "WASHING_MACHINE"],
    [/desk|study/, "STUDY_DESK"],
    [/mrt|train station/, "NEAR_MRT"],
    [/quiet|peaceful|silent/, "QUIET"],
    [/no agent|without agent/, "NO_AGENT_FEE"],
    [/short lease|one semester|1 semester|few months|sublet/, "SHORT_LEASE"],
    [/long lease|whole year|1 year|full year/, "LONG_LEASE"],
    [/female only|girls only/, "FEMALE_ONLY"],
    [/male only|guys only/, "MALE_ONLY"],
  ];
  const niceToHaveTags = keywordTags
    .filter(([re]) => re.test(q))
    .map(([, tag]) => tag);

  let roomType: RoomType | null = null;
  if (/whole unit|entire (?:unit|flat|apartment)|whole (?:flat|apartment)/.test(q)) {
    roomType = "WHOLE_UNIT";
  } else if (/\bsingle room\b|\bown room\b/.test(q)) {
    roomType = "SINGLE";
  }

  let category: ListingCategory | null = null;
  if (/on[- ]?campus|hall\b|halls\b|dorm/.test(q)) category = "ON_CAMPUS";
  else if (/off[- ]?campus/.test(q)) category = "OFF_CAMPUS";

  let travelMode: TravelMode | null = null;
  if (/walk/.test(q)) travelMode = "walking";
  else if (/bus|mrt|transit|public transport/.test(q)) travelMode = "transit";
  else if (/driv|car\b/.test(q)) travelMode = "driving";

  const commute = q.match(/(\d{1,2})\s*(?:min|minute)/);
  const maxCommuteMin = commute ? Number(commute[1]) : null;

  return {
    minPrice,
    maxPrice,
    mustHaveTags: [],
    niceToHaveTags,
    category,
    roomType,
    travelMode,
    maxCommuteMin,
    nuance: query,
    summary: query || "All available rooms",
    source: "heuristic",
  };
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
    include: { provider: { select: { id: true, name: true, image: true } } },
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

export async function rankListings(
  intent: SeekerIntent,
  listings: ListingWithProvider[],
  originalQuery: string,
): Promise<{ ranked: RankedListing[]; rankedBy: "llm" | "heuristic" }> {
  if (listings.length === 0) return { ranked: [], rankedBy: "heuristic" };

  const candidates = listings.slice(0, MAX_CANDIDATES);
  const overflow = listings.slice(MAX_CANDIDATES);

  if (!hasOpenRouterKey()) {
    return { ranked: heuristicRank(intent, listings), rankedBy: "heuristic" };
  }

  try {
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

    // Anything the model dropped still deserves to appear, just lower down.
    const missing = [...candidates.filter((l) => !seen.has(l.id)), ...overflow];
    ranked.push(...heuristicRank(intent, missing));

    if (ranked.length === 0) {
      return { ranked: heuristicRank(intent, listings), rankedBy: "heuristic" };
    }
    return { ranked, rankedBy: "llm" };
  } catch (error) {
    console.error("[matching] ranking failed, using heuristics:", error);
    return { ranked: heuristicRank(intent, listings), rankedBy: "heuristic" };
  }
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Deterministic scoring used when OpenRouter is unavailable, and to backfill
 * listings the model omitted. Also produces a plain-English reason so the UI
 * looks identical either way.
 */
export function heuristicRank(
  intent: SeekerIntent,
  listings: ListingWithProvider[],
): RankedListing[] {
  const mode = intent.travelMode ?? "transit";
  const nuanceWords = intent.nuance
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);

  return listings
    .map((listing) => {
      let score = 50;
      const reasons: string[] = [];

      // Budget fit
      if (intent.maxPrice != null) {
        if (listing.price <= intent.maxPrice) {
          const headroom = (intent.maxPrice - listing.price) / intent.maxPrice;
          score += 15 + Math.round(headroom * 10);
          reasons.push(`$${listing.price} is within your $${intent.maxPrice} budget`);
        } else {
          score -= 20;
          reasons.push(`$${listing.price} is over your budget`);
        }
      } else {
        reasons.push(`$${listing.price}/month`);
      }

      // Tag overlap
      const wanted = [...intent.mustHaveTags, ...intent.niceToHaveTags];
      const matchedTags = wanted.filter((t) =>
        (listing.tags as ListingTag[]).includes(t),
      );
      score += matchedTags.length * 6;
      if (matchedTags.length > 0) {
        reasons.push(
          matchedTags
            .slice(0, 2)
            .map((t) => TAG_LABELS[t].toLowerCase())
            .join(" and "),
        );
      }

      // Commute. On-campus listings are excluded from distance scoring so they
      // do not automatically dominate; they get a neutral contribution.
      if (listing.category === "ON_CAMPUS") {
        reasons.push("on-campus sublet");
      } else {
        const minutes = commuteMinutes(listing, mode);
        score += Math.max(-15, 15 - Math.round(minutes / 3));
        reasons.push(`${minutes} min to campus by ${mode}`);
      }

      // Nuance keyword hits in the description
      const haystack = `${listing.title} ${listing.description}`.toLowerCase();
      const hits = nuanceWords.filter((w) => haystack.includes(w));
      score += Math.min(12, hits.length * 4);

      return {
        listing,
        score: clampScore(score),
        reason: capitalise(reasons.slice(0, 3).join(", ")),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  const { ranked, rankedBy } = await rankListings(intent, listings, query);
  return { intent, results: ranked, relaxations, rankedBy };
}
