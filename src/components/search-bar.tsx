"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  ViewTransition,
} from "react";

import {
  endSearch,
  startSearch,
  useSearchRunning,
} from "@/components/search-progress";
import {
  CATEGORY_LABELS,
  COMMUTE_BANDS,
  ROOM_TYPE_LABELS,
  TAG_GROUPS,
  TAG_LABELS,
  TRAVEL_MODE_LABELS,
} from "@/lib/constants";
import type { TravelMode } from "@/lib/matching";
import type {
  ListingCategory,
  ListingTag,
  RoomType,
} from "@/generated/prisma/enums";

export type SearchBarValues = {
  q: string;
  category: ListingCategory | "";
  roomType: RoomType | "";
  minPrice: string;
  maxPrice: string;
  tags: ListingTag[];
  /** Minutes, as a string so it round-trips through the URL unchanged. */
  commute: string;
  commuteMode: TravelMode | "";
};

/**
 * A small enumeration as a row of pills, "Any" first.
 *
 * A native <select> was doing this job, which meant the two controls a seeker
 * reaches for most were the only OS-drawn widgets in an app whose vocabulary
 * is pills everywhere else - and it hid both the options and the current
 * choice behind a click. These are the same pills the post form uses to set
 * the tags, so the thing a provider ticks and the thing a seeker filters on
 * now look like the same kind of thing.
 */
function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (next: T | "") => void;
}) {
  const choices: { value: T | ""; label: string }[] = [
    { value: "", label: "Any" },
    ...options,
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const active = value === choice.value;
          return (
            <button
              key={choice.value || "any"}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(choice.value)}
              className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${active
                ? "border-brand bg-brand-soft font-medium text-brand-ink"
                : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
                }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

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
  variant = "default",
}: {
  initial?: Partial<SearchBarValues>;
  showExamples?: boolean;
  autoFocus?: boolean;
  /**
   * `hero` only changes the example chips, which on the landing page are
   * centred and drawn to be legible on a photograph. The box itself is
   * deliberately identical in both places - see the comment on the form.
   */
  variant?: "default" | "hero";
}) {
  const hero = variant === "hero";
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
    tags: initial?.tags ?? [],
    commute: initial?.commute ?? "",
    commuteMode: initial?.commuteMode ?? "",
  });
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      initial?.category ||
      initial?.roomType ||
      initial?.minPrice ||
      initial?.maxPrice ||
      initial?.tags?.length ||
      initial?.commute,
    ),
  );

  // Takes an override rather than reading state, because the two callers that
  // change a value and search in the same click - an example chip, Clear all -
  // would otherwise submit the values from before their own setState.
  function submit(override?: Partial<SearchBarValues>) {
    const next = { ...values, ...override };
    const params = new URLSearchParams();
    const q = next.q.trim();
    if (q) params.set("q", q);
    if (next.category) params.set("category", next.category);
    if (next.roomType) params.set("roomType", next.roomType);
    if (next.minPrice) params.set("min", next.minPrice);
    if (next.maxPrice) params.set("max", next.maxPrice);
    // Repeated rather than comma-joined: one param per tag keeps the URL
    // readable and means a malformed one drops itself, not the others.
    for (const tag of next.tags) params.append("tag", tag);
    if (next.commute) {
      params.set("commute", next.commute);
      // Only carried alongside a limit: a travel mode on its own filters
      // nothing, and would sit in the URL looking like it did.
      if (next.commuteMode) params.set("mode", next.commuteMode);
    }
    // Carried over rather than rebuilt: neither of these is set from this
    // form - the boundary is drawn on the map and the order is chosen beside
    // the results - and a new search must not silently throw either away.
    const area = searchParams?.get("area");
    if (area) params.set("area", area);
    const sort = searchParams?.get("sort");
    if (sort) params.set("sort", sort);
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

  // Tags count one each: ticking four amenities is four narrowings, and a
  // badge reading "1" next to four active pills would undercount the filter.
  const activeFilterCount =
    [
      values.category,
      values.roomType,
      values.minPrice,
      values.maxPrice,
      values.commute,
    ].filter(Boolean).length + values.tags.length;

  const rootRef = useRef<HTMLDivElement>(null);

  // The panel floats over the results, so it has to close the way a floating
  // panel does. A backdrop would be simpler but it would also swallow clicks
  // on the query field behind it; listening from the document leaves the rest
  // of the page live while the panel is open.
  useEffect(() => {
    if (!filtersOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  function clearFilters() {
    const cleared: Partial<SearchBarValues> = {
      category: "",
      roomType: "",
      minPrice: "",
      maxPrice: "",
      tags: [],
      commute: "",
      commuteMode: "",
    };
    setValues((v) => ({ ...v, ...cleared }));
    setFiltersOpen(false);
    submit(cleared);
  }

  function toggleTag(tag: ListingTag) {
    setValues((v) => ({
      ...v,
      tags: v.tags.includes(tag)
        ? v.tags.filter((t) => t !== tag)
        : [...v.tags, tag],
    }));
  }

  return (
    <div ref={rootRef} className="w-full">
      {/* The filter panel is positioned rather than laid out - in flow it
          pushed the map and the whole results grid down the page every time
          someone opened it - and this is what it is positioned against.

          It anchors to the box and the phone-width Filters button, not to the
          whole component, because the example chips are inside the component
          too: anchored to the root, the panel opened *below* the examples on
          the landing page, leaving a strip of chips between the button pressed
          and the panel it opened. It belongs over them. */}
      <div className="relative">
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
            {/* One style, both places. The box on the landing page and the box on
                /search are the same object mid-flight for the length of a view
                transition, so anything that differs between them - a radius, a
                button colour, a shadow - is a crossfade the reader sees as the
                box changing into a different box. The only thing that may differ
                is the width, which is what the morph is animating. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="card flex items-center gap-2.5 rounded-full p-2.5 shadow-[0_2px_10px_rgba(46,43,37,0.10)] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--color-brand-soft)]"
            >
              <ViewTransition
                name="search-box-field"
                share="search-morph"
                default="none"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <svg
                    viewBox="0 0 20 20"
                    className="ml-3 h-[19px] w-[19px] shrink-0 text-ink-faint"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
                    className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                  />
                </div>
              </ViewTransition>

              <ViewTransition
                name="search-box-actions"
                share="search-morph"
                default="none"
              >
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((o) => !o)}
                    aria-expanded={filtersOpen}
                    className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-4 py-2.5 font-display text-[13px] font-medium text-ink-mid transition-colors hover:bg-surface-muted sm:inline-flex"
                  >
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-bone tabular-nums">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  {/* Wide enough for "Searching" at rest, so swapping the label
                      does not resize the button. It shares a snapshot with the
                      Filters button, which is pinned to the box's right edge - a
                      22px jump here would slide Filters out from under itself
                      halfway through the morph.
  
                      Driven by `searching`, not `isPending`, for the same reason
                      the glow is: `isPending` belongs to one useTransition, and a
                      search started on the landing page ends that transition the
                      moment /search is ready to paint - which is well before the
                      rooms are. The box that renders there is a different mount
                      with its own transition state, so the label fell back to
                      "Search" while the pipeline was still running. */}
                  <button
                    type="submit"
                    disabled={searching}
                    className="inline-flex min-w-[7rem] shrink-0 items-center justify-center rounded-full bg-ink px-6 py-2.5 font-display text-[15px] font-semibold text-canvas transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {searching ? "Searching" : "Search"}
                  </button>
                </div>
              </ViewTransition>
            </form>
          </div>
        </ViewTransition>

        {/* The phone-width trigger. Below sm there is no room for it inside the
            box, so it stands on its own - which is exactly why it cannot be bare
            text: on its own above the map it read as a caption for the search
            field rather than as something to press. Built to match the Hide map
            button it sits next to, so the two read as the pair of controls they
            are. */}
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted sm:hidden"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-ink-faint"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 3.2A.7.7 0 0 1 2.7 2.5h10.6a.7.7 0 0 1 .53 1.16L9.8 8.4v4.1a.7.7 0 0 1-1.02.62l-2.1-1.07a.7.7 0 0 1-.38-.62V8.4L2.17 3.66A.7.7 0 0 1 2 3.2Z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-bone tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>

        {filtersOpen && (
          <div
            role="group"
            aria-label="Filters"
            className="card absolute inset-x-0 top-full z-50 mt-2 p-4 shadow-[0_10px_30px_rgba(28,26,23,0.12)] sm:p-5"
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <PillGroup
                label="Category"
                value={values.category}
                options={(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map(
                  (c) => ({ value: c, label: CATEGORY_LABELS[c] }),
                )}
                onChange={(category) => setValues((v) => ({ ...v, category }))}
              />

              <PillGroup
                label="Room type"
                value={values.roomType}
                options={(Object.keys(ROOM_TYPE_LABELS) as RoomType[]).map(
                  (r) => ({ value: r, label: ROOM_TYPE_LABELS[r] }),
                )}
                onChange={(roomType) => setValues((v) => ({ ...v, roomType }))}
              />

              <fieldset className="min-w-0">
                <legend className="mb-2 text-xs font-medium text-ink-soft">
                  Monthly rent (SGD)
                </legend>
                <div className="flex items-center gap-2">
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
                    aria-label="Minimum monthly rent in SGD"
                    className="field min-w-0"
                  />
                  <span className="shrink-0 text-[13px] text-ink-faint">to</span>
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
                    aria-label="Maximum monthly rent in SGD"
                    className="field min-w-0"
                  />
                </div>
              </fieldset>
            </div>

            {/* The app pays Distance Matrix for these three numbers on every
                listing and caches them on the row. They were readable on the
                cards and filterable only if the seeker happened to phrase a
                duration the parser recognised. This reads the stored columns -
                no Maps call, one comparison. */}
            <div className="mt-5 border-t border-line pt-4">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-ink-soft">
                  Commute to NTU
                </legend>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { value: "", label: "Any" },
                    ...COMMUTE_BANDS.map((m) => ({
                      value: String(m),
                      label: `Under ${m} min`,
                    })),
                  ].map((band) => {
                    const active = values.commute === band.value;
                    return (
                      <button
                        key={band.value || "any"}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setValues((v) => ({ ...v, commute: band.value }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${active
                          ? "border-brand bg-brand-soft font-medium text-brand-ink"
                          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
                          }`}
                      >
                        {band.label}
                      </button>
                    );
                  })}

                  {/* Only once a limit is set: choosing how to travel is
                      meaningless until there is a duration to measure. */}
                  {values.commute && (
                    <span className="ml-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] text-ink-faint">by</span>
                      {(
                        Object.keys(TRAVEL_MODE_LABELS) as TravelMode[]
                      ).map((m) => {
                        const active =
                          (values.commuteMode || "transit") === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setValues((v) => ({ ...v, commuteMode: m }))
                            }
                            className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${active
                              ? "border-brand bg-brand-soft font-medium text-brand-ink"
                              : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
                              }`}
                          >
                            {TRAVEL_MODE_LABELS[m]}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-faint">
                  On-campus rooms are always kept: they are already there.
                </p>
              </fieldset>
            </div>

            {/* The same vocabulary, the same groups and the same pills the post
                form uses to set these. They were fully built on the posting side
                and unreachable from search, so a seeker who needed pet friendly
                or female only could only hope the parser inferred it from prose.
                Ticked here they are hard filters, and unlike the model's guesses
                they are never relaxed. */}
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-xs font-medium text-ink-soft">Must have</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TAG_GROUPS.map((group) => (
                  <fieldset key={group.label} className="min-w-0">
                    <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                      {group.label}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tags.map((tag) => {
                        const active = values.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleTag(tag)}
                            className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${active
                              ? "border-brand bg-brand-soft font-medium text-brand-ink"
                              : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
                              }`}
                          >
                            {TAG_LABELS[tag]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="text-[13px] font-medium text-ink-soft underline-offset-2 transition-colors hover:text-ink hover:underline disabled:cursor-default disabled:text-ink-faint disabled:no-underline"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(false);
                  submit();
                }}
                className="btn-primary"
              >
                Show results
              </button>
            </div>
          </div>
        )}
      </div>

      {showExamples && (
        <div
          className={`flex flex-wrap items-center gap-2 ${hero ? "mt-[18px] justify-center" : "mt-4"
            }`}
        >
          {/* The chips are queries, not categories, and without a word in front
              of them the row reads as a list of the only things you may ask
              for. "Try:" is what makes them examples. */}
          <span
            className={
              hero
                ? "on-photo-text text-[13px] text-cream"
                : "text-xs text-ink-faint"
            }
          >
            Try:
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setValues((v) => ({ ...v, q: example }));
                submit({ q: example });
              }}
              className={
                hero
                  ? "on-photo-text on-photo-shape rounded-full border border-canvas/55 px-3.5 py-[7px] text-[13px] text-cream transition-colors backdrop-blur-[2px] hover:bg-canvas/20"
                  : "rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-ink"
              }
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
