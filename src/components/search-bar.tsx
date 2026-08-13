"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, ViewTransition } from "react";

import {
  endSearch,
  startSearch,
  useSearchRunning,
} from "@/components/search-progress";
import { CATEGORY_LABELS, ROOM_TYPE_LABELS } from "@/lib/constants";
import type { ListingCategory, RoomType } from "@/generated/prisma/enums";

export type SearchBarValues = {
  q: string;
  category: ListingCategory | "";
  roomType: RoomType | "";
  minPrice: string;
  maxPrice: string;
};

const EXAMPLES = [
  "quiet room near campus, under $700, don't mind sharing",
  "hall sublet for one semester, cheap as possible",
  "ensuite with aircon, walking distance to NTU",
  "pet friendly place, chill landlord, around $800",
];

export function SearchBar({
  initial,
  showExamples = false,
  autoFocus = false,
}: {
  initial?: Partial<SearchBarValues>;
  showExamples?: boolean;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const running = useSearchRunning();
  const [values, setValues] = useState<SearchBarValues>({
    q: initial?.q ?? "",
    category: initial?.category ?? "",
    roomType: initial?.roomType ?? "",
    minPrice: initial?.minPrice ?? "",
    maxPrice: initial?.maxPrice ?? "",
  });
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(initial?.category || initial?.roomType || initial?.minPrice || initial?.maxPrice),
  );

  function submit(overrideQuery?: string) {
    const params = new URLSearchParams();
    const q = (overrideQuery ?? values.q).trim();
    if (q) params.set("q", q);
    if (values.category) params.set("category", values.category);
    if (values.roomType) params.set("roomType", values.roomType);
    if (values.minPrice) params.set("min", values.minPrice);
    if (values.maxPrice) params.set("max", values.maxPrice);
    // Carried over rather than rebuilt: the boundary is drawn on the map, not
    // in this form, and a new search must not silently throw it away.
    const area = searchParams?.get("area");
    if (area) params.set("area", area);
    // Only a search with words in it lights the box. An empty box orders the
    // rooms by date and calls no model at all - no parse, no embedding, no
    // reasons - so a glow there would be claiming work that is not happening.
    // The `else` matters as much as the `if`: submitting an empty box after a
    // search is a decision to stop searching, and it has to put out a glow it
    // did not light.
    //
    // Outside the transition on purpose. Inside it, the glow would be deferred
    // along with the navigation and would not appear until the browse page was
    // ready - which is the moment it has the least to say. The pipeline starts
    // on the same click, so the box lights up the instant it starts waiting.
    if (q) startSearch();
    else endSearch();
    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
  }

  // The store is global, so a search abandoned mid-flight (enter, then a click
  // on "Post a room") must not leave the box on the landing page glowing about
  // a search nobody is waiting for any more. Either this box is the one that
  // just fired, or it is the one on the page the results are coming to.
  const searching = running && (isPending || pathname === "/search");

  const activeFilterCount = [
    values.category,
    values.roomType,
    values.minPrice,
    values.maxPrice,
  ].filter(Boolean).length;

  return (
    <div className="w-full">
      {/* The box is the same object on the landing page and on /search, just in
          a different place and a different width, so it morphs between the two
          instead of being torn down and redrawn. `share` names the animation
          class the CSS in globals.css targets; `default="none"` keeps the pair
          out of every *other* transition on the page - without it, changing a
          filter chip or drawing a boundary would crossfade the bar (and with it
          the whole browse view) on a navigation where nothing moved.

          The field and the buttons are named separately from the box for one
          reason: only the box actually changes shape. Left as part of the box's
          snapshot they would be stretched from 768px to full width with it,
          which smears the query text and the button. Captured on their own they
          are painted at their natural size against their own edge, so the box
          grows while the text and the buttons stay sharp and simply travel. */}
      <ViewTransition name="search-box" share="search-morph" default="none">
        {/* The shell exists to hold the glow (globals.css draws it as pseudo-
            elements on this and on the form), and it is what the view
            transition captures, so the glow travels with the box rather than
            waiting for it at the far end. Its border box is the form's, so the
            morph geometry is unchanged. */}
        <div className="search-box" data-searching={searching ? "" : undefined}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="card flex items-center gap-2 p-2 shadow-[0_1px_3px_rgba(28,26,23,0.05)] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--color-brand-soft)]"
          >
            <ViewTransition
              name="search-box-field"
              share="search-morph"
              default="none"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <svg
                  viewBox="0 0 20 20"
                  className="ml-2 h-4.5 w-4.5 shrink-0 text-ink-faint"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="9" r="6" />
                  <path d="m14 14 4 4" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={values.q}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, q: e.target.value }))
                  }
                  placeholder="Describe the room you want, in your own words"
                  aria-label="Describe the room you want"
                  autoFocus={autoFocus}
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            </ViewTransition>

            <ViewTransition
              name="search-box-actions"
              share="search-morph"
              default="none"
            >
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((o) => !o)}
                  aria-expanded={filtersOpen}
                  className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-surface-muted sm:inline-flex"
                >
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white tabular-nums">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {/* Wide enough for "Searching" at rest, so swapping the label
                    does not resize the button. It shares a snapshot with the
                    Filters button, which is pinned to the box's right edge - a
                    22px jump here would slide Filters out from under itself
                    halfway through the morph. */}
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary min-w-[7rem] shrink-0"
                >
                  {isPending ? "Searching" : "Search"}
                </button>
              </div>
            </ViewTransition>
          </form>
        </div>
      </ViewTransition>

      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        className="mt-2 text-[13px] text-ink-soft underline-offset-2 hover:underline sm:hidden"
      >
        {filtersOpen ? "Hide filters" : "Filters"}
        {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </button>

      {filtersOpen && (
        <div className="card mt-2 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Category
            </span>
            <select
              value={values.category}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  category: e.target.value as ListingCategory | "",
                }))
              }
              className="field"
            >
              <option value="">Any</option>
              {(
                Object.keys(CATEGORY_LABELS) as ListingCategory[]
              ).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Room type
            </span>
            <select
              value={values.roomType}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  roomType: e.target.value as RoomType | "",
                }))
              }
              className="field"
            >
              <option value="">Any</option>
              {(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map((r) => (
                <option key={r} value={r}>
                  {ROOM_TYPE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Min price (SGD)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={values.minPrice}
              onChange={(e) =>
                setValues((v) => ({ ...v, minPrice: e.target.value }))
              }
              placeholder="0"
              className="field"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-ink-soft">
              Max price (SGD)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={values.maxPrice}
              onChange={(e) =>
                setValues((v) => ({ ...v, maxPrice: e.target.value }))
              }
              placeholder="Any"
              className="field"
            />
          </label>
        </div>
      )}

      {showExamples && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-faint">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setValues((v) => ({ ...v, q: example }));
                submit(example);
              }}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
