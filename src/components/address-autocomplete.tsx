"use client";

import { useEffect, useId, useRef, useState } from "react";

import { LocationPicker } from "./location-picker";
import { isInsideCampus } from "@/lib/campus";

type Suggestion = { placeId: string; primary: string; secondary: string };

/**
 * Address field backed by /api/places/autocomplete.
 *
 * Keeps a Places session token for the lifetime of one address selection,
 * which is how Google expects autocomplete + details to be billed together.
 */
export function AddressAutocomplete({
  error,
  initial,
  onPointChange,
}: {
  error?: string;
  /**
   * The listing's saved location, when editing. It submits with an empty
   * placeId, which is how the edit action knows the address was left alone and
   * the cached commute can stand.
   */
  initial?: { address: string; lat: number; lng: number };
  /** The point that will be submitted, or null while there is none. */
  onPointChange?: (point: { lat: number; lng: number } | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState(initial?.address ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [selected, setSelected] = useState<{
    placeId: string;
    address: string;
  } | null>(initial ? { placeId: "", address: initial.address } : null);
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  // `coords` is what gets submitted; `anchor` is the geocoded point the picker
  // recentres on. They diverge once the provider drags the pin.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [anchor, setAnchor] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [pinAdjusted, setPinAdjusted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced lookup.
  useEffect(() => {
    if (selected?.address === query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(query)}&session=${sessionToken}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
        setHighlighted(-1);
      } catch {
        // Aborted or failed - leave the previous suggestions in place.
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, sessionToken, selected]);

  // Report the point that would be submitted. An effect rather than a call at
  // each assignment: `coords` moves when an address is chosen, when the pin is
  // dragged and when the field is typed over, and those three must not drift
  // apart from what the form is told.
  useEffect(() => {
    onPointChange?.(coords);
  }, [coords, onPointChange]);

  // Close on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function choose(suggestion: Suggestion) {
    const label = [suggestion.primary, suggestion.secondary]
      .filter(Boolean)
      .join(", ");
    setQuery(label);
    setSelected({ placeId: suggestion.placeId, address: label });
    setOpen(false);
    setSuggestions([]);

    // Resolve coordinates now so the form has them before submit.
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&session=${sessionToken}`,
      );
      if (res.ok) {
        const detail = (await res.json()) as {
          address: string;
          lat: number;
          lng: number;
        };
        setSelected({ placeId: suggestion.placeId, address: detail.address || label });
        setQuery(detail.address || label);
        setCoords({ lat: detail.lat, lng: detail.lng });
        setAnchor({ lat: detail.lat, lng: detail.lng });
        setPinAdjusted(false);
      }
    } catch {
      // Submit-time revalidation will catch a missing coordinate.
    }
    // A session token covers one autocomplete-to-details cycle.
    setSessionToken(crypto.randomUUID());
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault();
      void choose(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setCoords(null);
          setAnchor(null);
          setPinAdjusted(false);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Start typing an address, e.g. Blk 644 Jurong West"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="field"
      />

      <input type="hidden" name="address" value={selected?.address ?? ""} />
      <input type="hidden" name="placeId" value={selected?.placeId ?? ""} />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />
      <input
        type="hidden"
        name="pinAdjusted"
        value={pinAdjusted ? "true" : "false"}
      />

      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-ink-faint">
          ...
        </span>
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-[0_8px_24px_rgba(28,26,23,0.10)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => void choose(suggestion)}
                className={`block w-full px-3 py-2 text-left transition-colors ${
                  index === highlighted ? "bg-surface-muted" : ""
                }`}
              >
                <span className="block truncate text-[14px] text-ink">
                  {suggestion.primary}
                </span>
                {suggestion.secondary && (
                  <span className="block truncate text-xs text-ink-faint">
                    {suggestion.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && coords && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-accent">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm-1-4.6 5-5-1.1-1L7 8.3 5.1 6.4l-1 1L7 10.4Z" />
          </svg>
          {/* The category is not asked for anywhere, so this line is where the
              provider finds out which one their address landed in. Inside the
              campus there is no commute to quote - it is stored as zero. */}
          {isInsideCampus(coords)
            ? "Address set. The room is on campus."
            : "Address set. The commute to NTU is calculated from this point."}
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-brand-ink">{error}</p>}

      <div className="mt-3">
        <LocationPicker
          value={anchor}
          disabled={!anchor}
          onChange={(point, adjusted) => {
            setCoords(point);
            setPinAdjusted(adjusted);
          }}
        />
      </div>
    </div>
  );
}
