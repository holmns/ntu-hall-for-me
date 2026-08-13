"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_MAP_ID,
  loadMapClasses,
  metersBetween,
  type GAdvancedMarker,
  type GMap,
} from "@/lib/maps-client";
import { MapOptions, type MapType, type PoiLayer } from "./map-options";
import { NTU_CAMPUS, WEST_SG_NEIGHBOURHOODS } from "@/lib/constants";

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

type Poi = { id: string; name: string; lat: number; lng: number };

/** Centre and half-diagonal of what the map is currently showing. */
type Viewport = { lat: number; lng: number; radius: number };

/** One resolved Places lookup, tagged with the layer+area it answers for. */
type FetchedPois = { key: string; places: Poi[]; failed: boolean };

/** Stable identity, so the marker effect does not rebuild on every render. */
const EMPTY_POIS: Poi[] = [];

/** Neighbourhood centroids inside the current view, or all of them at start. */
function neighbourhoodsIn(view: Viewport | null): Poi[] {
  const inView = view
    ? WEST_SG_NEIGHBOURHOODS.filter((n) => metersBetween(view, n) <= view.radius)
    : WEST_SG_NEIGHBOURHOODS;
  return inView.map((n) => ({ id: n.name, ...n }));
}

// Written as whole literals so Tailwind's scanner sees them: these are applied
// to raw DOM inside a marker, not to JSX.
const PIN_BASE =
  "cursor-pointer select-none whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] font-semibold tabular-nums shadow-[0_1px_5px_rgba(28,26,23,0.2)] transition-transform duration-150 ease-out";
const PIN_IDLE = "border-line-strong bg-surface text-ink hover:scale-110";
const PIN_ACTIVE = "border-brand bg-brand text-white scale-110";

const POI_DOT_COLOUR: Record<string, string> = {
  restaurants: "#c2703b",
  transit: "#2563eb",
};

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

/**
 * Points of interest are reference, not results, so they read as quieter than
 * a price pin: a dot with a hover title for the two Places layers, and a plain
 * label for neighbourhoods, where the name is the entire point.
 */
function poiElement(name: string, layer: PoiLayer): HTMLElement {
  if (layer === "neighbourhoods") {
    const label = document.createElement("div");
    label.className =
      "select-none whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft [text-shadow:0_1px_3px_rgba(255,255,255,0.95),0_0_6px_rgba(255,255,255,0.9)]";
    label.textContent = name;
    return label;
  }

  const dot = document.createElement("div");
  dot.title = name;
  dot.style.width = "10px";
  dot.style.height = "10px";
  dot.style.borderRadius = "50%";
  dot.style.backgroundColor = POI_DOT_COLOUR[layer] ?? "#57534e";
  dot.style.border = "2px solid #ffffff";
  dot.style.boxShadow = "0 0 0 1px rgba(28, 26, 23, 0.2)";
  return dot;
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
 * Whether the map has moved enough to be worth another Places call. Panning
 * a block must not cost a request, so the threshold is a fraction of what is
 * already on screen rather than a fixed distance.
 */
function worthRefetching(prev: Viewport | null, next: Viewport): boolean {
  if (!prev) return true;
  if (metersBetween(prev, next) > prev.radius * 0.4) return true;
  return Math.abs(next.radius - prev.radius) > prev.radius * 0.35;
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
  signedIn,
}: {
  pins: MapPin[];
  selectedId: string | null;
  /** `null` clears the selection, e.g. a click on empty map. */
  onSelect: (id: string | null) => void;
  /** Gates the two points-of-interest layers that cost a Places call. */
  signedIn: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  // Created lazily inside an effect rather than during render: these entries
  // are mutated (restyled) in place on every selection change.
  const markersRef = useRef<Map<
    string,
    { marker: GAdvancedMarker; el: HTMLElement }
  > | null>(null);
  const poiMarkersRef = useRef<GAdvancedMarker[] | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [mapType, setMapType] = useState<MapType>("default");
  const [poi, setPoi] = useState<PoiLayer>("none");
  const [view, setView] = useState<Viewport | null>(null);
  // Only the two Places-backed layers need state; "none" and "neighbourhoods"
  // are derived below, because storing a value you can compute is what makes
  // an effect fight the render.
  const [fetched, setFetched] = useState<FetchedPois | null>(null);

  // Read inside effects that must not re-run when a callback identity moves.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  /**
   * Frame the map on the rooms.
   *
   * Guarded on a real container size because the map column is sized by a flex
   * chain: the Map can be constructed a frame before the browser has given the
   * div its height, and fitBounds against a collapsed box lands somewhere in
   * Johor. The ResizeObserver below re-runs this once the size settles.
   */
  const fitToPins = useCallback(() => {
    const map = mapRef.current;
    const el = ref.current;
    const list = pinsRef.current;
    if (!map || !el || list.length === 0) return;
    if (el.clientWidth < 80 || el.clientHeight < 80) return;

    // A marker's label is anchored under its point and spreads sideways, so
    // the horizontal padding has to clear half a price pill or the easternmost
    // room loses its price off the edge.
    map.fitBounds(boundsOf(list), { top: 40, right: 64, bottom: 48, left: 64 });
    // A single room fits to a point, which Maps reads as maximum zoom.
    if (list.length === 1 && (map.getZoom() ?? 0) > 16) map.setZoom(16);
  }, []);

  const readViewport = useCallback((map: GMap) => {
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const centre = {
      lat: (ne.lat() + sw.lat()) / 2,
      lng: (ne.lng() + sw.lng()) / 2,
    };
    const next: Viewport = {
      ...centre,
      radius: metersBetween(centre, { lat: ne.lat(), lng: ne.lng() }),
    };
    setView((prev) => (worthRefetching(prev, next) ? next : prev));
  }, []);

  // Build the map once. Markers are attached by the effects below.
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
        map.addListener("idle", () => readViewport(map));

        setStatus("ready");
      })
      .catch((error) => {
        console.error("[results-map] failed to initialise:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, readViewport]);

  useEffect(() => {
    if (status !== "ready") return;
    // "hybrid" rather than "satellite": imagery with no street names is
    // useless for judging where a room is.
    mapRef.current?.setMapTypeId(
      mapType === "satellite" ? "hybrid" : "roadmap",
    );
  }, [mapType, status]);

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

      fitToPins();
    });
    // `pins` is intentionally absent: pinKey is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiKey, pinKey, fitToPins]);

  // Re-frame when the map's box actually changes size - the first real layout
  // after mount, the mobile map toggle, a window resize. Panning does not
  // resize anything, so this never yanks the map back from under the reader.
  useEffect(() => {
    const el = ref.current;
    if (status !== "ready" || !el) return;

    let last = { w: 0, h: 0 };
    const observer = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (Math.abs(w - last.w) < 24 && Math.abs(h - last.h) < 24) return;
      last = { w, h };
      fitToPins();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, fitToPins]);

  // What the chosen layer resolves to for whatever the map is showing now.
  // Neighbourhoods are local data, so they never touch the network.
  const remoteKey =
    (poi === "restaurants" || poi === "transit") && view && signedIn
      ? `${poi}:${view.lat.toFixed(3)}:${view.lng.toFixed(3)}:${view.radius}`
      : null;
  const settled = remoteKey && fetched?.key === remoteKey ? fetched : null;

  const pois: Poi[] =
    poi === "neighbourhoods"
      ? neighbourhoodsIn(view)
      : (settled?.places ?? EMPTY_POIS);

  const poiStatus: "idle" | "loading" | "failed" = !remoteKey
    ? "idle"
    : !settled
      ? "loading"
      : settled.failed
        ? "failed"
        : "idle";

  // One Places call per layer per area, and only once the view has moved
  // enough for the answer to differ (see worthRefetching).
  useEffect(() => {
    if (!remoteKey || !view) return;

    let cancelled = false;
    const url = `/api/places/nearby?layer=${poi}&lat=${view.lat}&lng=${view.lng}&radius=${view.radius}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`nearby ${res.status}`);
        return res.json() as Promise<{ places?: Poi[] }>;
      })
      .then((data) => {
        if (!cancelled) {
          setFetched({ key: remoteKey, places: data.places ?? [], failed: false });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[results-map] nearby places failed:", error);
        setFetched({ key: remoteKey, places: [], failed: true });
      });

    return () => {
      cancelled = true;
    };
    // `view` and `poi` are both folded into remoteKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey]);

  const poiKey = pois.map((p) => p.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    const existing = (poiMarkersRef.current ??= []);
    for (const marker of existing) marker.map = null;
    existing.length = 0;

    if (pois.length === 0) return;

    loadMapClasses(apiKey).then(({ AdvancedMarkerElement }) => {
      if (mapRef.current !== map) return;
      for (const place of pois) {
        existing.push(
          new AdvancedMarkerElement({
            map,
            position: { lat: place.lat, lng: place.lng },
            content: poiElement(place.name, poi),
            title: place.name,
            // Under the rooms. These are context, never the answer.
            zIndex: 0,
          }),
        );
      }
    });
    // `pois` is intentionally absent: poiKey is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiKey, poiKey, poi]);

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

      {status === "ready" && (
        <MapOptions
          mapType={mapType}
          onMapType={setMapType}
          poi={poi}
          onPoi={setPoi}
          signedIn={signedIn}
          poiStatus={poiStatus}
          poiCount={pois.length}
        />
      )}

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted">
          <span className="text-xs text-ink-faint">Loading map...</span>
        </div>
      )}

      {selected && (
        /* Clear of the bottom strip: Google's logo and attribution have to
           stay legible, and they sit in that last ~24px. */
        <div className="pointer-events-none absolute inset-x-2 bottom-7 z-10">
          <Link
            href={`/listings/${selected.id}`}
            className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-line bg-surface/95 p-2.5 shadow-[0_4px_20px_rgba(28,26,23,0.14)] backdrop-blur-sm transition-colors hover:border-line-strong"
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
