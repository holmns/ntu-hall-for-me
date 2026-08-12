"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { SearchBar } from "@/components/search-bar";
import type { ListingCategory, RoomType } from "@/generated/prisma/enums";

/**
 * Search depends on OpenRouter for both the query parse and the ranking, and
 * there is no keyword fallback behind it. When that call fails the seeker gets
 * this instead of a result list quietly built from guesses.
 *
 * The boundary replaces the whole route segment, so it re-renders the search
 * bar itself - otherwise a failed search would strand the seeker on a page with
 * no way to edit the query and try again.
 */
export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[search] failed:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-[52px]" />}>
        <RestoredSearchBar />
      </Suspense>

      <div className="card mt-6 px-6 py-14 text-center">
        <p className="text-[15px] font-medium text-ink">
          Search is unavailable right now
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
          Rooms are ranked by a language model, and that call did not go
          through. Nothing is wrong with your search - try it again in a moment.
        </p>
        <button type="button" onClick={reset} className="btn-secondary mt-5">
          Try again
        </button>
      </div>
    </div>
  );
}

/** Keeps whatever the seeker typed in the box so retrying is one click. */
function RestoredSearchBar() {
  const sp = useSearchParams();
  const category = sp.get("category");
  const roomType = sp.get("roomType");

  return (
    <SearchBar
      initial={{
        q: sp.get("q") ?? "",
        category:
          category === "ON_CAMPUS" || category === "OFF_CAMPUS"
            ? (category as ListingCategory)
            : "",
        roomType:
          roomType === "SINGLE" ||
          roomType === "SHARED" ||
          roomType === "WHOLE_UNIT"
            ? (roomType as RoomType)
            : "",
        minPrice: sp.get("min") ?? "",
        maxPrice: sp.get("max") ?? "",
      }}
    />
  );
}
