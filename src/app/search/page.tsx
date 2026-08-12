import { Suspense } from "react";

import { SearchBar } from "@/components/search-bar";
import { ListingCard } from "@/components/listing-card";
import { IntentPanel } from "@/components/intent-panel";
import { searchListings, type ChipFilters } from "@/lib/matching";
import type { ListingCategory, RoomType } from "@/generated/prisma/enums";

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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
  const { intent, results, relaxations } = await searchListings(query, chips);
  const mode = intent.travelMode ?? "transit";

  return (
    <div className="mt-6">
      {query.trim() && <IntentPanel intent={intent} count={results.length} />}

      {relaxations.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span className="font-medium">Nothing matched exactly.</span>{" "}
          {relaxations.join(" ")}
        </div>
      )}

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-ink-soft">
          {results.length} {results.length === 1 ? "room" : "rooms"}
          {query.trim() ? " ranked for you" : ""}
        </h2>
      </div>

      {results.length === 0 ? (
        <div className="card mt-3 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">No rooms found</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Nothing is listed that fits those constraints. Try widening the
            budget or clearing a filter.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {results.map((result, index) => (
            <ListingCard
              key={result.listing.id}
              listing={result.listing}
              reason={query.trim() ? result.reason : undefined}
              rank={query.trim() ? index + 1 : undefined}
              mode={mode}
            />
          ))}
        </div>
      )}
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
            ? "Reading your request and ranking rooms..."
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
