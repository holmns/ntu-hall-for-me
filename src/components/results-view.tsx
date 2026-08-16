"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { ResultsMap, type MapPin } from "./results-map";
import { decodeArea, encodeArea, type AreaPoint } from "@/lib/area-filter";
import type { SortOrder } from "@/lib/matching";

/** The fields any offered ordering needs, for every room on the page. */
export type SortKey = {
  id: string;
  price: number;
  commute: number;
  createdAt: number;
};

/**
 * Must match `sortSql` in matching.ts, including the tiebreak, or the order
 * the reader sees would change under them the moment the server answers.
 */
const COMPARATORS: Record<SortOrder, (a: SortKey, b: SortKey) => number> = {
  price_asc: (a, b) => a.price - b.price || b.createdAt - a.createdAt,
  price_desc: (a, b) => b.price - a.price || b.createdAt - a.createdAt,
  commute_asc: (a, b) => a.commute - b.commute || b.createdAt - a.createdAt,
  commute_desc: (a, b) => b.commute - a.commute || b.createdAt - a.createdAt,
  newest: (a, b) => b.createdAt - a.createdAt,
};

type SortApi = {
  sort: SortOrder | null;
  choose: (next: SortOrder | null) => void;
  pending: boolean;
};

const SortContext = createContext<SortApi | null>(null);
/** For the sort control, which renders inside this component's children. */
export function useSortControl(): SortApi {
  const ctx = useContext(SortContext);
  if (!ctx) throw new Error("SortSelect must be rendered inside ResultsView");
  return ctx;
}

/** id -> CSS `order`, or null while the DOM order is already correct. */
const OrderContext = createContext<Map<string, number> | null>(null);

/**
 * Which room is currently "live" across the browse page, and what caused it.
 *
 * The source matters: a selection that came from the map has to scroll the
 * list to the matching card, while one that came from hovering a card must
 * not scroll anything (the reader is already looking at it) and should clear
 * itself again on the way out.
 */
type Selection = { id: string; source: "map" | "list" } | null;

type SelectionApi = {
  selection: Selection;
  select: (id: string, source: "map" | "list") => void;
  clear: (id: string) => void;
};

const SelectionContext = createContext<SelectionApi | null>(null);

function useSelection(): SelectionApi {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error("SelectableCard must be rendered inside ResultsView");
  }
  return ctx;
}

/**
 * Browse layout: the result list beside a map of the same rooms.
 *
 * `children` is the server-rendered card list, passed straight through, so
 * everything the results page streams (reasons arriving into per-card Suspense
 * boundaries) keeps working untouched. This component only adds the map column
 * and the state that links the two.
 *
 * It also owns the drawn boundary, even though the map is what draws it. The
 * boundary is a URL change, and a URL change re-runs the whole search - so the
 * component that can dim the list and keep the map steady while that happens
 * is the one that should be starting it.
 */
export function ResultsView({
  pins,
  sortKeys,
  serverSort,
  children,
}: {
  pins: MapPin[];
  /** Every room on the page, in the order the server rendered them. */
  sortKeys: SortKey[];
  /** The ordering the server actually used, from the URL. */
  serverSort: SortOrder | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selection, setSelection] = useState<Selection>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AreaPoint[] | null>(null);

  // Ordering is the one thing on this page the browser can answer by itself:
  // every room is already in the DOM with its price and date, so reordering is
  // presentation, not a query. Shown optimistically so a click repaints on the
  // spot instead of waiting on a round trip that re-renders the map and
  // re-streams the reasons only to return the same rooms in a new order.
  //
  // `serverSort` is still what the order means - React drops the optimistic
  // value once the navigation commits, by which point the URL agrees, and puts
  // it back if the navigation never lands.
  const [sort, showSort] = useOptimistic(serverSort);
  const [sortPending, startSortTransition] = useTransition();

  const chooseSort = useCallback(
    (next: SortOrder | null) => {
      // The URL is sent anyway, for the two things only the server can do:
      // make the order shareable and survive a reload, and move the match
      // reasons onto the ten rooms that are now on top. Nothing on screen
      // waits for it.
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("sort", next);
      else params.delete("sort");
      const query = params.toString();

      startSortTransition(() => {
        showSort(next);
        router.push(query ? `/search?${query}` : "/search");
      });
    },
    [router, searchParams, showSort],
  );

  // Null under "best match": the server already emitted that order, so leaving
  // `order` unset keeps the cards in document order and costs no styles.
  const sortKeyIds = sortKeys.map((k) => k.id).join(",");
  const orderById = useMemo(() => {
    if (!sort) return null;
    const ranked = [...sortKeys].sort(COMPARATORS[sort]);
    return new Map(ranked.map((key, index) => [key.id, index]));
    // sortKeyIds is the stable identity of sortKeys, which is a fresh array on
    // every render of the server payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, sortKeyIds]);

  const areaParam = searchParams.get("area");
  // While the search is in flight, show the shape the seeker just drew rather
  // than the one still in the URL. `pending` clearing is what hands control
  // back to the URL, so this cannot get stuck out of sync.
  const area = pending ? draft : decodeArea(areaParam);

  const select = useCallback((id: string, source: "map" | "list") => {
    setSelection({ id, source });
  }, []);

  // Only the hover that set the selection may take it away again. A card
  // clearing someone else's selection would kill a pin the reader just clicked.
  const clear = useCallback((id: string) => {
    setSelection((current) =>
      current && current.id === id && current.source === "list"
        ? null
        : current,
    );
  }, []);

  const onMapSelect = useCallback(
    (id: string | null) => setSelection(id ? { id, source: "map" } : null),
    [],
  );

  /**
   * Push the boundary into the URL.
   *
   * Inside a transition on purpose: that is what lets React keep the current
   * map and results on screen while the new ones load, instead of tearing the
   * page down to a Suspense fallback. The results page must not put a `key` on
   * its Suspense boundary or this stops working - a keyed boundary remounts,
   * and a remount always shows the fallback.
   */
  const applyArea = useCallback(
    (points: AreaPoint[] | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (points) params.set("area", encodeArea(points));
      else params.delete("area");
      const query = params.toString();

      setDraft(points);
      startTransition(() => {
        router.push(query ? `/search?${query}` : "/search");
      });
    },
    [router, searchParams],
  );

  const sortApi = useMemo(
    () => ({ sort, choose: chooseSort, pending: sortPending }),
    [sort, chooseSort, sortPending],
  );

  return (
    <SortContext.Provider value={sortApi}>
    <OrderContext.Provider value={orderById}>
    <SelectionContext.Provider value={{ selection, select, clear }}>
      {/* Map first in the source and on the left at desktop widths, the way a
          rental search reads: the map is the browsing surface and the list is
          the detail beside it. On a phone the two stack, map on top.

          The list track is a percentage, not a pixel cap. Capped at 480px it
          stopped growing at about 1100px of viewport and every pixel after
          that went to the map, so a 1800px monitor bought more empty Jurong
          and still showed two and a half cards. As a percentage both columns
          scale together and a bigger screen buys rooms. The px floor is what
          stops the list collapsing at the lg breakpoint itself. */}
      <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(380px,40%)] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,44%)]">
        <div className="min-w-0 lg:h-full">
          <div className="lg:h-full">
            <button
              type="button"
              onClick={() => setMapOpen((open) => !open)}
              aria-expanded={mapOpen}
              className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted lg:hidden"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5 text-ink-faint"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
              </svg>
              {mapOpen ? "Hide map" : "Show map"}
            </button>

            <div
              className={`${mapOpen ? "block" : "hidden"} h-[320px] sm:h-[420px] lg:block lg:h-full`}
            >
              <ResultsMap
                pins={pins}
                selectedId={selection?.id ?? null}
                onSelect={onMapSelect}
                area={area}
                onAreaChange={applyArea}
                busy={pending}
              />
            </div>
          </div>
        </div>

        {/* The only thing that scrolls on desktop. `pr-1` keeps the scrollbar
            off the cards' right edge; `pl-1` matches it on the left so the
            selection ring's box-shadow isn't clipped by the scroll container
            (overflow-y-auto makes the x-axis overflow auto too, and a ring
            with zero left inset gets cut). Dimmed rather than replaced while
            a new search runs, so the page never goes blank under the reader. */}
        {/* `data-sorted` hides the rank chips: they number the model's order,
            and the reader is looking at a different one. Deliberately not
            keyed on `sortPending` - the dimming below is for a search whose
            results are about to change, and a sort's are not. */}
        <div
          aria-busy={pending}
          data-sorted={sort ? "" : undefined}
          className={`min-w-0 transition-opacity lg:h-full lg:overflow-y-auto lg:pl-1 lg:pr-1 ${
            pending ? "pointer-events-none opacity-45" : ""
          }`}
        >
          {children}
          <p className="mt-6 hidden border-t border-line pt-4 text-xs leading-relaxed text-ink-faint lg:block">
            NTU Room Finder is a student project. Listings are posted by users
            and are not verified, endorsed by, or affiliated with NTU.
          </p>
        </div>
      </div>
    </SelectionContext.Provider>
    </OrderContext.Provider>
    </SortContext.Provider>
  );
}

/**
 * Wraps one server-rendered card so hovering it lights up its pin, and a click
 * on that pin brings the card into view. Purely a shell: the card itself, its
 * link and its streamed reason are all still server components underneath.
 */
export function SelectableCard({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { selection, select, clear } = useSelection();
  // The card inside stays a server component; only its position changes, and
  // `order` on a grid item moves it without re-rendering or remounting
  // anything - which is what keeps the streamed reason boundaries intact.
  const order = useContext(OrderContext)?.get(id);
  const ref = useRef<HTMLDivElement>(null);
  const selected = selection?.id === id;
  const fromMap = selected && selection?.source === "map";

  useEffect(() => {
    if (!fromMap) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [fromMap]);

  return (
    <div
      ref={ref}
      style={order != null ? { order } : undefined}
      onMouseEnter={() => select(id, "list")}
      onMouseLeave={() => clear(id)}
      onFocus={() => select(id, "list")}
      onBlur={() => clear(id)}
      className={`rounded-card transition-shadow ${
        selected ? "shadow-[0_0_0_2px_var(--color-brand)]" : ""
      }`}
    >
      {children}
    </div>
  );
}
