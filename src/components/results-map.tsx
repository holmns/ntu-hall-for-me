"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_MAP_ID,
  loadMapClasses,
  type GAdvancedMarker,
  type GMap,
} from "@/lib/maps-client";
import { NTU_CAMPUS } from "@/lib/constants";

/**
 * Everything the map needs about one room. Built server-side so the client
 * bundle never sees a full listing row, and deliberately flat: `subtitle` is
 * already formatted because the commute label depends on the travel mode the
 * parse picked, which is a server-side concern.
 */
export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  price: number;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  imageAlt: string;
};

// Written as whole literals so Tailwind's scanner sees them: these are applied
// to raw DOM inside a marker, not to JSX.
const PIN_BASE =
  "cursor-pointer select-none whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] font-semibold tabular-nums shadow-[0_1px_5px_rgba(28,26,23,0.2)] transition-transform duration-150 ease-out";
const PIN_IDLE = "border-line-strong bg-surface text-ink hover:scale-110";
const PIN_ACTIVE = "border-brand bg-brand text-white scale-110";

function pinElement(price: number): HTMLElement {
  const el = document.createElement("div");
  el.className = `${PIN_BASE} ${PIN_IDLE}`;
  el.textContent = `$${price.toLocaleString()}`;
  return el;
}

function ntuMarkerContent(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className =
    "flex items-center gap-1 rounded-full bg-accent px-2 py-[3px] text-[11px] font-semibold text-white shadow-[0_1px_5px_rgba(28,26,23,0.2)]";
  wrap.textContent = "NTU";
  return wrap;
}

/** Bounding box over every pin plus campus, so NTU is always in frame. */
function boundsOf(pins: MapPin[]) {
  const lats = [NTU_CAMPUS.lat, ...pins.map((p) => p.lat)];
  const lngs = [NTU_CAMPUS.lng, ...pins.map((p) => p.lng)];
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

/**
 * The browse map: one price marker per room in the current result set.
 *
 * Selection is owned by the parent (`ResultsView`) rather than by this
 * component, because the same selection drives the card list. Everything here
 * is imperative Maps DOM, so markers are created once per result set and only
 * restyled when the selection changes - re-creating them on every hover would
 * flash the whole layer.
 */
export function ResultsMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: MapPin[];
  selectedId: string | null;
  /** `null` clears the selection, e.g. a click on empty map. */
  onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  // Created lazily inside an effect rather than during render: these entries
  // are mutated (restyled) in place on every selection change.
  const markersRef = useRef<Map<
    string,
    { marker: GAdvancedMarker; el: HTMLElement }
  > | null>(null);
  // Read inside effects that must not re-run when the callback identity moves.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  // Build the map once. Markers are attached by the effect below.
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    loadMapClasses(apiKey)
      .then(({ Map, AdvancedMarkerElement }) => {
        if (cancelled || !ref.current) return;

        const map = new Map(ref.current, {
          center: NTU_CAMPUS,
          zoom: 13,
          mapId: DEFAULT_MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          // The rooms span ~9km east-west and ~5km north-south, so integer
          // zoom rounds down a whole step and leaves the pins as a small
          // cluster in a lot of sea. Fractional zoom lets fitBounds land on
          // the level that actually fills the panel.
          isFractionalZoomEnabled: true,
        });
        mapRef.current = map;

        new AdvancedMarkerElement({
          map,
          position: NTU_CAMPUS,
          title: "NTU main campus",
          content: ntuMarkerContent(),
          // Above the price pins. Campus is what every commute on this page is
          // measured to, and the on-campus rooms sit right on top of it, so a
          // half-covered NTU label would orient nobody.
          zIndex: 4,
        });

        // Tapping the map itself is the way out of a selection on a phone,
        // where there is no hover to move away from.
        map.addListener("click", () => onSelectRef.current(null));

        setStatus("ready");
      })
      .catch((error) => {
        console.error("[results-map] failed to initialise:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  // Rebuild the marker layer whenever the result set changes, and frame it.
  // Keyed on the id list rather than the array identity, which is new on every
  // render of the server payload.
  const pinKey = pins.map((p) => p.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    const markers = (markersRef.current ??= new Map());
    for (const { marker } of markers.values()) marker.map = null;
    markers.clear();

    loadMapClasses(apiKey).then(({ AdvancedMarkerElement }) => {
      if (mapRef.current !== map) return;
      for (const pin of pins) {
        const el = pinElement(pin.price);
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: pin.lat, lng: pin.lng },
          content: el,
          title: pin.title,
          gmpClickable: true,
          zIndex: 2,
        });
        marker.addEventListener("gmp-click", () =>
          onSelectRef.current(pin.id),
        );
        markers.set(pin.id, { marker, el });
      }

      // A marker's label is anchored under its point and spreads sideways, so
      // the horizontal padding has to clear half a price pill or the
      // easternmost room loses its price off the edge.
      if (pins.length > 0) {
        map.fitBounds(boundsOf(pins), {
          top: 40,
          right: 64,
          bottom: 48,
          left: 64,
        });
      }
      // A single room fits to a point, which Maps reads as maximum zoom.
      if (pins.length === 1 && (map.getZoom() ?? 0) > 16) map.setZoom(16);
    });
    // `pins` is intentionally absent: pinKey is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiKey, pinKey]);

  // Restyle on selection, and pan only when the marker is off-screen - panning
  // on every hover would make the map lurch under the reader.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    for (const [id, { el, marker }] of markersRef.current ?? []) {
      const active = id === selectedId;
      el.className = `${PIN_BASE} ${active ? PIN_ACTIVE : PIN_IDLE}`;
      marker.zIndex = active ? 3 : 2;
    }

    if (!selectedId) return;
    const pin = pins.find((p) => p.id === selectedId);
    const bounds = map.getBounds();
    if (!pin || !bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const visible =
      pin.lat <= ne.lat() &&
      pin.lat >= sw.lat() &&
      pin.lng <= ne.lng() &&
      pin.lng >= sw.lng();
    if (!visible) map.panTo({ lat: pin.lat, lng: pin.lng });
  }, [selectedId, status, pins]);

  const selected = selectedId
    ? (pins.find((p) => p.id === selectedId) ?? null)
    : null;

  if (status === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-muted px-6 text-center">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-ink-faint"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        </svg>
        <p className="text-[13px] font-medium text-ink-soft">
          Map could not be loaded
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-faint">
          Check that NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the Maps JavaScript
          API is enabled, and the key allows this referrer. The list of rooms is
          unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-line bg-surface-muted">
      <div ref={ref} className="h-full w-full" />

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted">
          <span className="text-xs text-ink-faint">Loading map...</span>
        </div>
      )}

      {selected && (
        /* Clear of the bottom strip: Google's logo and attribution have to
           stay legible, and they sit in that last ~24px. */
        <div className="pointer-events-none absolute inset-x-2 bottom-7">
          <Link
            href={`/listings/${selected.id}`}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface/95 p-2.5 shadow-[0_4px_20px_rgba(28,26,23,0.14)] backdrop-blur-sm transition-colors hover:border-line-strong"
          >
            <div className="h-14 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
              {selected.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selected.imageUrl}
                  alt={selected.imageAlt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-line-strong"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.5" />
                    <path
                      d="m4 17 4.5-4.5L12 16l3-3 5 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-snug text-ink">
                {selected.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-ink-soft">
                {selected.subtitle}
              </p>
            </div>
            <span className="shrink-0 pr-1 text-right">
              <span className="block text-[13px] font-semibold tabular-nums text-ink">
                ${selected.price.toLocaleString()}
              </span>
              <span className="block text-[10px] text-ink-faint">
                per month
              </span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
