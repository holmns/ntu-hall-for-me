import { Suspense } from "react";

import { SearchBar } from "@/components/search-bar";
import { ListingCard, ReasonPill } from "@/components/listing-card";
import { IntentPanel } from "@/components/intent-panel";
import { ResultsView, SelectableCard } from "@/components/results-view";
import type { MapPin } from "@/components/results-map";
import { ROOM_TYPE_LABELS, TRAVEL_MODE_LABELS } from "@/lib/constants";
import {
  commuteMinutes,
  REASON_LIMIT,
  searchListings,
  type ChipFilters,
  type ListingWithProvider,
  type ReasonMap,
  type TravelMode,
} from "@/lib/matching";
import type { ListingCategory, RoomType } from "@/generated/prisma/enums";

/**
 * Resolved form of the reasons promise. The rejection is folded into a value
 * rather than left to throw: by the time reasons resolve the rooms are already
 * on screen, and letting a failed caption bubble to the route's error boundary
 * would replace a perfectly good result list with an error page.
 */
type ReasonState = { ok: true; reasons: ReasonMap } | { ok: false };

export const dynamic = "force-dynamic";

function parseChips(sp: Record<string, string | string[] | undefined>): ChipFilters {
  const one = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (key: string) => {
    const v = one(key);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const category = one("category");
  const roomType = one("roomType");
  return {
    minPrice: num("min"),
    maxPrice: num("max"),
    category:
      category === "ON_CAMPUS" || category === "OFF_CAMPUS"
        ? (category as ListingCategory)
        : null,
    roomType:
      roomType === "SINGLE" || roomType === "SHARED" || roomType === "WHOLE_UNIT"
        ? (roomType as RoomType)
        : null,
  };
}

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const chips = parseChips(sp);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <SearchBar
        initial={{
          q: query,
          category: chips.category ?? "",
          roomType: chips.roomType ?? "",
          minPrice: chips.minPrice ? String(chips.minPrice) : "",
          maxPrice: chips.maxPrice ? String(chips.maxPrice) : "",
        }}
      />

      <Suspense
        key={`${query}|${JSON.stringify(chips)}`}
        fallback={<ResultsSkeleton query={query} />}
      >
        <Results query={query} chips={chips} />
      </Suspense>
    </div>
  );
}

async function Results({
  query,
  chips,
}: {
  query: string;
  chips: ChipFilters;
}) {
  const { intent, listings, reasons, relaxations } = await searchListings(
    query,
    chips,
  );
  const mode = intent.travelMode ?? "transit";

  // Settled once, here, so all the card boundaries below share a single call
  // and a failure becomes data instead of a thrown error.
  const reasonState: Promise<ReasonState> = reasons.then(
    (map) => ({ ok: true as const, reasons: map }),
    (error) => {
      console.error("[search] reasons failed:", error);
      return { ok: false as const };
    },
  );

  return (
    <div className="mt-6">
      {query.trim() && <IntentPanel intent={intent} count={listings.length} />}

      {relaxations.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span className="font-medium">Nothing matched exactly.</span>{" "}
          {relaxations.join(" ")}
        </div>
      )}

      {query.trim() && listings.length > 0 && (
        <Suspense fallback={null}>
          <ReasonFailureNotice state={reasonState} />
        </Suspense>
      )}

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-ink-soft">
          {listings.length} {listings.length === 1 ? "room" : "rooms"}
          {query.trim() ? " for you" : ""}
        </h2>
      </div>

      {listings.length === 0 ? (
        <div className="card mt-3 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">No rooms found</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Nothing is listed that fits those constraints. Try widening the
            budget or clearing a filter.
          </p>
        </div>
      ) : (
        <ResultsView pins={listings.map((l) => toMapPin(l, mode))}>
          <div className="mt-3 grid gap-3">
            {listings.map((listing, index) => (
              // The card stays a server component; this only wires hovering it
              // to its pin on the map.
              <SelectableCard key={listing.id} id={listing.id}>
                <ListingCard
                  listing={listing}
                  // Only the listings that got sent for a reason reserve space
                  // for one. The rest render exactly as they do when browsing.
                  reason={
                    query.trim() && index < REASON_LIMIT ? (
                      <Suspense fallback={<ReasonSkeleton />}>
                        <Reason state={reasonState} listingId={listing.id} />
                      </Suspense>
                    ) : undefined
                  }
                  rank={query.trim() ? index + 1 : undefined}
                  mode={mode}
                />
              </SelectableCard>
            ))}
          </div>
        </ResultsView>
      )}
    </div>
  );
}

/**
 * Flattens a listing into the small shape the map needs. The commute label is
 * baked in here because the travel mode comes from the parsed intent, which
 * only exists on the server.
 */
function toMapPin(listing: ListingWithProvider, mode: TravelMode): MapPin {
  const cover = listing.images[0];
  const commute =
    listing.category === "ON_CAMPUS"
      ? "On campus"
      : `${commuteMinutes(listing, mode)} min ${TRAVEL_MODE_LABELS[mode]} to NTU`;

  return {
    id: listing.id,
    lat: listing.lat,
    lng: listing.lng,
    price: listing.price,
    title: listing.title,
    subtitle: `${ROOM_TYPE_LABELS[listing.roomType]} / ${commute}`,
    imageUrl: cover?.url ?? null,
    imageAlt: cover?.alt ?? "",
  };
}

/** Streams in once the reasons call resolves. Renders nothing until then. */
async function Reason({
  state,
  listingId,
}: {
  state: Promise<ReasonState>;
  listingId: string;
}) {
  const settled = await state;
  if (!settled.ok) return null;

  const reason = settled.reasons.get(listingId);
  if (!reason) return null;

  return <ReasonPill>{reason}</ReasonPill>;
}

/** Holds the reason's place so the card does not resize when one arrives. */
function ReasonSkeleton() {
  return (
    <ReasonPill>
      <span className="block h-3.5 w-3/5 animate-pulse rounded bg-brand/15" />
    </ReasonPill>
  );
}

/**
 * Says so when the reasons call failed. Shown once above the list rather than
 * repeated on ten cards, and never as a silent absence - a missing explanation
 * should read as a failure, not as "no reason to give".
 */
async function ReasonFailureNotice({ state }: { state: Promise<ReasonState> }) {
  const settled = await state;
  if (settled.ok) return null;

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] text-ink-soft">
      <span className="font-medium text-ink">
        Could not write the match explanations.
      </span>{" "}
      These rooms all match your filters; only the per-room reasons are missing.
    </div>
  );
}

function ResultsSkeleton({ query }: { query: string }) {
  return (
    <div className="mt-6">
      <div className="card flex items-center gap-3 px-4 py-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
        <span className="text-[13px] text-ink-soft">
          {query.trim()
            ? "Reading your request and finding rooms..."
            : "Loading rooms..."}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5">
            <div className="flex justify-between gap-4">
              <div className="h-4 w-2/5 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-surface-muted" />
            </div>
            <div className="mt-3 h-3 w-3/5 animate-pulse rounded bg-surface-muted" />
            <div className="mt-4 h-9 w-full animate-pulse rounded-lg bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
