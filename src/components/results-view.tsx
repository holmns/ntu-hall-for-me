"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ResultsMap, type MapPin } from "./results-map";

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
 * and the selection that links the two.
 */
export function ResultsView({
  pins,
  children,
}: {
  pins: MapPin[];
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [mapOpen, setMapOpen] = useState(true);

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

  // Nothing to plot: give the list the full width rather than an empty map.
  if (pins.length === 0) return <>{children}</>;

  return (
    <SelectionContext.Provider value={{ selection, select, clear }}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
        <div className="order-2 min-w-0 lg:order-1">{children}</div>

        {/* First on a phone so the map and its collapse toggle are the first
            thing in reach, second on desktop where it becomes the side panel. */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-[4.5rem]">
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
              {mapOpen ? "Hide map" : `Show ${pins.length} on a map`}
            </button>

            {/* Capped rather than full-height: fitBounds frames the pins by
                whichever axis is tighter, so a very tall column zooms out far
                enough to fit the width and fills the rest with sea. */}
            <div
              className={`${mapOpen ? "block" : "hidden"} h-[300px] sm:h-[380px] lg:block lg:h-[min(calc(100vh-8rem),560px)]`}
            >
              <ResultsMap
                pins={pins}
                selectedId={selection?.id ?? null}
                onSelect={onMapSelect}
              />
            </div>
          </div>
        </div>
      </div>
    </SelectionContext.Provider>
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
