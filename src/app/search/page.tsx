import { Suspense } from "react";

import { SearchBar } from "@/components/search-bar";
import { ListingCard, ReasonPill } from "@/components/listing-card";
import { IntentPanel } from "@/components/intent-panel";
import { ResultsView, SelectableCard } from "@/components/results-view";
import { SearchSettled, SearchStarted } from "@/components/search-progress";
import { SaveButton } from "@/components/save-button";
import { SortSelect } from "@/components/sort-select";
import type { MapPin } from "@/components/results-map";
import { getCurrentUser } from "@/lib/auth";
import { savedIdsAmong } from "@/lib/saved";
import { decodeArea } from "@/lib/area-filter";
import { NoResults, type Removable } from "@/components/no-results";
import {
  ALL_TAGS,
  CATEGORY_LABELS,
  COMMUTE_BANDS,
  ROOM_TYPE_LABELS,
  TAG_LABELS,
  TRAVEL_MODE_LABELS,
} from "@/lib/constants";
import {
  commuteMinutes,
  REASON_LIMIT,
  searchListings,
  type ChipFilters,
  type ListingWithProvider,
  type ReasonMap,
  type TravelMode,
} from "@/lib/matching";
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "@/generated/prisma/enums";

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
  // Repeated ?tag= params. Anything outside the enum is dropped rather than
  // rejected: a stale shared link should lose the tag it no longer knows, not
  // the whole search.
  const rawTags = sp.tag;
  const tags = (Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [])
    .filter((t): t is ListingTag => (ALL_TAGS as readonly string[]).includes(t));
  // Only the three offered bands. An arbitrary ?commute=7 is not a filter
  // anyone can have set from the panel, and honouring it would let a URL
  // narrow the results in a way the panel could not then show or clear.
  const commuteRaw = num("commute");
  const mode = one("mode");
  const sort = one("sort");
  return {
    sort:
      sort === "price_asc" ||
      sort === "price_desc" ||
      sort === "commute_asc" ||
      sort === "commute_desc" ||
      sort === "newest"
        ? sort
        : null,
    tags: tags.length > 0 ? tags : null,
    maxCommuteMin:
      commuteRaw != null &&
      (COMMUTE_BANDS as readonly number[]).includes(commuteRaw)
        ? commuteRaw
        : null,
    commuteMode:
      mode === "walking" || mode === "transit" || mode === "driving"
        ? mode
        : null,
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

/**
 * The constraints the seeker set that a zero-result page can offer to undo.
 *
 * Only chips. Everything the model guessed at has already been loosened by
 * `hardFilter`'s relaxation ladder by the time results come back empty, so
 * anything still narrowing the search was set deliberately - and each label
 * names the value, not the field, so the button says what it will actually do.
 */
function removableChips(chips: ChipFilters): Removable[] {
  const out: Removable[] = [];
  if (chips.minPrice != null || chips.maxPrice != null) {
    const min = chips.minPrice;
    const max = chips.maxPrice;
    out.push({
      key: "price",
      label:
        min != null && max != null
          ? `Drop the $${min}-$${max} range`
          : max != null
            ? `Drop the $${max} budget`
            : `Drop the $${min} minimum`,
    });
  }
  if (chips.category) {
    out.push({
      key: "category",
      label: `Drop "${CATEGORY_LABELS[chips.category]}"`,
    });
  }
  if (chips.roomType) {
    out.push({
      key: "roomType",
      label: `Drop "${ROOM_TYPE_LABELS[chips.roomType]}"`,
    });
  }
  if (chips.tags && chips.tags.length > 0) {
    out.push({
      key: "tags",
      label:
        chips.tags.length === 1
          ? `Drop "${TAG_LABELS[chips.tags[0]]}"`
          : `Drop the ${chips.tags.length} amenities`,
    });
  }
  if (chips.maxCommuteMin != null) {
    out.push({
      key: "commute",
      label: `Drop the ${chips.maxCommuteMin} min commute limit`,
    });
  }
  if (chips.area) out.push({ key: "area", label: "Clear the drawn area" });
  return out;
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
    // Full-bleed, unlike the rest of the app, and on desktop exactly one
    // viewport tall: the map fills its column and the results scroll inside
    // theirs, so the map never slides out of frame while you read. There is no
    // max width on purpose - every extra pixel goes to the map, which is the
    // browsing surface. `data-app-shell` is what hides the site footer and
    // widens the header bar to match (see globals.css); the list repeats the
    // disclaimer at its end instead. Below lg this is an ordinary scrolling
    // page.
    <div
      data-app-shell
      className="flex w-full flex-col px-4 py-4 sm:px-6 lg:h-[calc(100vh-3.5rem)]"
    >
      <SearchBar
        initial={{
          q: query,
          category: chips.category ?? "",
          roomType: chips.roomType ?? "",
          minPrice: chips.minPrice ? String(chips.minPrice) : "",
          maxPrice: chips.maxPrice ? String(chips.maxPrice) : "",
          tags: chips.tags ?? [],
          commute: chips.maxCommuteMin ? String(chips.maxCommuteMin) : "",
          commuteMode: chips.commuteMode ?? "",
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
  // The chip wins: a seeker who filtered on a walk to campus should read walk
  // minutes on the cards, not the transit ones the model assumed.
  const mode = chips.commuteMode ?? intent.travelMode ?? "transit";

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
        <div className="mt-3 rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-brand-ink">
          <span className="font-medium">Nothing matched exactly.</span>{" "}
          {relaxations.join(" ")}
        </div>
      )}

      {query.trim() && listings.length > 0 && (
        <Suspense fallback={null}>
          <ReasonFailureNotice state={reasonState} />
        </Suspense>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-sm font-medium text-ink-soft">
          {listings.length} {listings.length === 1 ? "room" : "rooms"}
          {query.trim() && !chips.sort ? " for you" : ""}
          {chips.area ? " in the area you drew" : ""}
        </h2>
        {listings.length > 0 && <SortSelect hasQuery={Boolean(query.trim())} />}
      </div>
    </>
  );

  return (
    // `lg:h-full` unbroken from the viewport-locked shell down to the map: one
    // auto-height wrapper anywhere in this chain and the map stretches to the
    // full height of the card list instead.
    <div className="lg:h-full">
      {/* The rooms are on screen, so the search box can stop glowing. Here
          rather than in the page shell because this component is the only one
          that has actually waited for `searchListings`. */}
      <SearchSettled />

      {/* The sort keys are what let the browser reorder without asking again:
          every room on the page, with the fields any offered ordering
          needs. Tiny beside the cards themselves, and it means a sort click
          repaints instead of re-running the pipeline. */}
      <ResultsView
        pins={listings.map((l) => toMapPin(l, mode))}
        sortKeys={listings.map((l) => ({
          id: l.id,
          price: l.price,
          commute: commuteMinutes(l, mode),
          createdAt: l.createdAt.getTime(),
        }))}
        serverSort={chips.sort ?? null}
      >
        {summary}

        {/* Rendered inside ResultsView rather than instead of it: a search
            narrowed to nothing is exactly when the map and its Clear control
            need to stay on screen. */}
        {listings.length === 0 && (
          <NoResults removable={removableChips(chips)} />
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
                // Only when the model did the ordering. Under an explicit
                // sort these would be row numbers wearing the ranking's
                // badge, claiming a judgement nothing made.
                rank={query.trim() && !chips.sort ? index + 1 : undefined}
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
 * One entry per placeholder card. Enough of them to fill a tall results column
 * rather than ending in blank sand halfway down it, and a different title width
 * each, because a column of identical bars reads as a rendering fault.
 */
const SKELETON_TITLE_WIDTHS = [
  "w-3/5",
  "w-4/5",
  "w-1/2",
  "w-2/3",
  "w-3/4",
  "w-7/12",
];

/**
 * Cold load only - every later search keeps the previous results on screen.
 * Mirrors the real two-column shape so the page does not visibly reflow from a
 * single column into a map beside a list the moment the data lands.
 */
function ResultsSkeleton({ query }: { query: string }) {
  const searching = Boolean(query.trim());

  return (
    // Track sizes must stay in step with ResultsView's grid, or the cold load
    // reflows into a differently-proportioned page the moment the data lands.
    <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(380px,40%)] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,44%)]">
      {/* This fallback only ever renders for a search this tab did not start -
          a shared link, a reload, or Browse in the header - so it is the one
          place that has to arm the box rather than the other way round. Only
          when there is something to read, though: browsing with an empty box
          calls no model, and lighting up for a plain date-ordered list would be
          the glow's only lie. */}
      {searching && <SearchStarted />}

      {/* The map column, at the same heights ResultsView gives it at every
          width - including on a phone, where the real page shows a map and this
          used to show nothing at all. */}
      <div className="min-w-0 lg:h-full">
        {/* Stands in for the Hide map toggle, which only exists below lg. */}
        <div className="mb-2 h-8 w-24 animate-pulse rounded-lg bg-surface-muted lg:hidden" />
        <div className="grid h-[320px] place-items-center rounded-xl border border-line bg-surface-muted sm:h-[420px] lg:h-full">
          {/* The status line lives here rather than over the list: it is the
              one panel that is the same size before and after the data lands,
              so saying it here costs the results no vertical space and moves
              nothing when the map replaces it. Same pill the map itself uses
              for "Finding rooms in that area...". */}
          <p className="flex items-center gap-2 rounded-full bg-ink/85 px-3.5 py-1.5 text-[12px] font-medium text-bone shadow-[0_2px_10px_rgba(28,26,23,0.25)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {searching
              ? "Reading your request and finding rooms..."
              : "Loading rooms..."}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        {/* What we understood, which only renders when there is a query. */}
        {searching && (
          <div className="card animate-pulse overflow-hidden">
            <div className="border-b border-line bg-surface-muted/60 px-4 py-2.5">
              <span className="block h-3 w-32 rounded bg-surface-muted" />
            </div>
            <div className="px-4 py-3.5">
              <span className="block h-4 w-3/5 rounded bg-surface-muted" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["w-24", "w-20", "w-28"].map((w) => (
                  <span
                    key={w}
                    className={`h-6 ${w} rounded-full bg-surface-muted`}
                  />
                ))}
              </div>
              {/* The "N rooms passed the hard filters" line, under its rule. */}
              <div className="mt-3 border-t border-line pt-3">
                <span className="block h-3 w-40 rounded bg-surface-muted" />
              </div>
            </div>
          </div>
        )}

        {/* The count heading and the sort pills beside it. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
          <div className="flex flex-wrap items-center gap-1.5">
            {["w-10", "w-24", "w-28", "w-28"].map((w) => (
              <span
                key={w}
                className={`h-6 ${w} animate-pulse rounded-full bg-surface-muted`}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          {SKELETON_TITLE_WIDTHS.map((width) => (
            <CardSkeleton key={width} titleWidth={width} reason={searching} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One placeholder room, in the row layout `ListingCard` renders on this page:
 * cover beside the text, the reason under it once the card is wide enough, tags
 * across the bottom. The pulse is on the card rather than on each bar so it
 * reads as one thing arriving, not nine.
 */
function CardSkeleton({
  titleWidth,
  reason,
}: {
  titleWidth: string;
  /** Reasons are only written when the seeker typed something. */
  reason: boolean;
}) {
  return (
    <div className="card @container animate-pulse p-4 sm:p-5">
      {/* Same tracks as the real card, so the cover does not change size or
          proportion under the photo that replaces it. */}
      <div className="grid grid-cols-[minmax(104px,min(32%,200px))_minmax(0,1fr)] items-start gap-x-3 gap-y-0 sm:gap-x-4">
        <div className="aspect-[4/3] w-full rounded-lg border border-line bg-surface-muted @md:row-span-3" />

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <span className={`mt-0.5 block h-4 ${titleWidth} rounded bg-surface-muted`} />
            <span className="block h-4 w-14 shrink-0 rounded bg-surface-muted" />
          </div>
          <span className="mt-2.5 block h-3 w-4/5 rounded bg-surface-muted" />
        </div>

        {reason && (
          <div className="col-span-2 mt-3 h-9 min-w-0 rounded-lg bg-brand-soft/70 @md:col-span-1 @md:col-start-2" />
        )}

        <div className="col-span-2 mt-3 flex min-w-0 flex-wrap gap-1.5 @md:col-span-1 @md:col-start-2">
          {["w-20", "w-16", "w-24"].map((w) => (
            <span key={w} className={`h-6 ${w} rounded-full bg-surface-muted`} />
          ))}
        </div>
      </div>
    </div>
  );
}
