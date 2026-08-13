import { Suspense } from "react";

import { SearchBar } from "@/components/search-bar";
import { ListingCard, ReasonPill } from "@/components/listing-card";
import { IntentPanel } from "@/components/intent-panel";
import { ResultsView, SelectableCard } from "@/components/results-view";
import { SaveButton } from "@/components/save-button";
import type { MapPin } from "@/components/results-map";
import { getCurrentUser } from "@/lib/auth";
import { savedIdsAmong } from "@/lib/saved";
import { decodeArea } from "@/lib/area-filter";
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
    // A malformed `area` decodes to null, which drops the boundary and shows
    // everything. Better than an error page over a mangled query string.
    area: decodeArea(one("area")),
  };
}

/** This exact search, so signing in from a save button comes back to it. */
function currentUrl(sp: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0]) params.set(key, value[0]);
  }
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const chips = parseChips(sp);

  return (
    // Wider than the rest of the app, and on desktop exactly one viewport tall:
    // the map fills its column and the results scroll inside theirs, so the map
    // never slides out of frame while you read. `data-app-shell` is what hides
    // the site footer for that (see globals.css); the list repeats it at the
    // end instead. Below lg this is an ordinary scrolling page.
    <div
      data-app-shell
      className="mx-auto flex w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:h-[calc(100vh-3.5rem)]"
    >
      <SearchBar
        initial={{
          q: query,
          category: chips.category ?? "",
          roomType: chips.roomType ?? "",
          minPrice: chips.minPrice ? String(chips.minPrice) : "",
          maxPrice: chips.maxPrice ? String(chips.maxPrice) : "",
        }}
      />

      {/* Deliberately unkeyed. A key here would remount the boundary on every
          search, and a remount always shows the fallback - which tore the map
          off the page for a second every time someone drew an area or changed
          a filter. Unkeyed, and with the navigations started inside a
          transition, React holds the previous results on screen until the new
          ones are ready. The fallback below is now only for a cold load. */}
      <div className="mt-4 min-h-0 flex-1">
        <Suspense fallback={<ResultsSkeleton query={query} />}>
          <Results query={query} chips={chips} backTo={currentUrl(sp)} />
        </Suspense>
      </div>
    </div>
  );
}

async function Results({
  query,
  chips,
  backTo,
}: {
  query: string;
  chips: ChipFilters;
  backTo: string;
}) {
  const { intent, listings, reasons, relaxations } = await searchListings(
    query,
    chips,
  );
  const mode = intent.travelMode ?? "transit";

  // After the search, so the shortlist lookup is one indexed query over the
  // ids actually being rendered rather than over everything the user saved.
  const user = await getCurrentUser();
  const savedIds = await savedIdsAmong(
    user?.id,
    listings.map((l) => l.id),
  );

  // Settled once, here, so all the card boundaries below share a single call
  // and a failure becomes data instead of a thrown error.
  const reasonState: Promise<ReasonState> = reasons.then(
    (map) => ({ ok: true as const, reasons: map }),
    (error) => {
      console.error("[search] reasons failed:", error);
      return { ok: false as const };
    },
  );

  // Everything that describes the result set lives in the right-hand column
  // beside the map, not above both, so the map starts at the top of the page
  // and keeps its full height.
  const summary = (
    <>
      {query.trim() && <IntentPanel intent={intent} count={listings.length} />}

      {relaxations.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span className="font-medium">Nothing matched exactly.</span>{" "}
          {relaxations.join(" ")}
        </div>
      )}

      {query.trim() && listings.length > 0 && (
        <Suspense fallback={null}>
          <ReasonFailureNotice state={reasonState} />
        </Suspense>
      )}

      <h2 className="mt-3 text-sm font-medium text-ink-soft">
        {listings.length} {listings.length === 1 ? "room" : "rooms"}
        {query.trim() ? " for you" : ""}
        {chips.area ? " in the area you drew" : ""}
      </h2>
    </>
  );

  return (
    // `lg:h-full` unbroken from the viewport-locked shell down to the map: one
    // auto-height wrapper anywhere in this chain and the map stretches to the
    // full height of the card list instead.
    <div className="lg:h-full">
      <ResultsView pins={listings.map((l) => toMapPin(l, mode))}>
        {summary}

        {/* Rendered inside ResultsView rather than instead of it: a search
            narrowed to nothing is exactly when the map and its Clear control
            need to stay on screen. */}
        {listings.length === 0 && (
          <div className="card mt-3 px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-ink">No rooms found</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
              {chips.area
                ? "No rooms sit inside the boundary you drew. Redraw it wider, or clear it from the map."
                : "Nothing is listed that fits those constraints. Try widening the budget or clearing a filter."}
            </p>
          </div>
        )}

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
                save={
                  <SaveButton
                    listingId={listing.id}
                    saved={savedIds.has(listing.id)}
                    signedIn={user != null}
                    callbackUrl={backTo}
                  />
                }
              />
            </SelectableCard>
          ))}
        </div>
      </ResultsView>
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

/**
 * Cold load only - every later search keeps the previous results on screen.
 * Mirrors the real two-column shape so the page does not visibly reflow from a
 * single column into a map beside a list the moment the data lands.
 */
function ResultsSkeleton({ query }: { query: string }) {
  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] lg:gap-5">
      <div className="hidden rounded-xl border border-line bg-surface-muted lg:block lg:h-full" />

      <div className="min-w-0">
        <div className="card flex items-center gap-3 px-4 py-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
          <span className="text-[13px] text-ink-soft">
            {query.trim()
              ? "Reading your request and finding rooms..."
              : "Loading rooms..."}
          </span>
        </div>
        <div className="mt-3 grid gap-3">
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
    </div>
  );
}
