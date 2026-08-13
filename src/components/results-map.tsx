"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_MAP_ID,
  loadMapClasses,
  metersBetween,
  type GAdvancedMarker,
  type GMap,
  type GMapsListener,
  type GPathOverlay,
} from "@/lib/maps-client";
import {
  DrawBoundaryControl,
  MapOptions,
  type MapType,
} from "./map-options";
import { NTU_CAMPUS, NTU_CAMPUS_OUTLINE } from "@/lib/constants";
import {
  areaBounds,
  decodeArea,
  encodeArea,
  type AreaPoint,
} from "@/lib/area-filter";

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

const BRAND = "#b3202f";
const ACCENT = "#0f766e";

/** Ignore mouse jitter under this while drawing, and thin the path with it. */
const DRAW_MIN_SPACING_M = 25;
/** Upper bound on a drawn shape, so the URL stays a sane length. */
const DRAW_MAX_POINTS = 60;

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

/**
 * Bounding box over every pin plus the whole campus outline - not just its
 * centre, or the western half of the shape falls outside the frame, which
 * looks like a rendering bug rather than a map edge.
 */
function boundsOf(pins: MapPin[]) {
  const lats = [...NTU_CAMPUS_OUTLINE.map((p) => p.lat), ...pins.map((p) => p.lat)];
  const lngs = [...NTU_CAMPUS_OUTLINE.map((p) => p.lng), ...pins.map((p) => p.lng)];
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

/** Evenly drop points from a long drag so the encoded shape stays short. */
function thin(points: AreaPoint[]): AreaPoint[] {
  if (points.length <= DRAW_MAX_POINTS) return points;
  const step = points.length / DRAW_MAX_POINTS;
  const out: AreaPoint[] = [];
  for (let i = 0; i < DRAW_MAX_POINTS; i++) {
    out.push(points[Math.floor(i * step)]);
  }
  return out;
}

/**
 * The browse map: one price marker per room in the current result set, the NTU
 * campus outlined underneath, and a boundary the seeker can draw to narrow the
 * search.
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const areaParam = searchParams.get("area");

  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  // Created lazily inside an effect rather than during render: these entries
  // are mutated (restyled) in place on every selection change.
  const markersRef = useRef<Map<
    string,
    { marker: GAdvancedMarker; el: HTMLElement }
  > | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [mapType, setMapType] = useState<MapType>("default");
  const [drawing, setDrawing] = useState(false);

  // Read inside effects that must not re-run when a callback identity moves.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  const area = decodeArea(areaParam);
  const areaRef = useRef(area);
  useEffect(() => {
    areaRef.current = decodeArea(areaParam);
  }, [areaParam]);

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
    const drawn = areaRef.current;
    if (!map || !el) return;
    if (el.clientWidth < 80 || el.clientHeight < 80) return;

    // With no rooms to frame, frame the boundary instead - "redraw it wider"
    // is useless advice if what you drew is off-screen.
    const target =
      list.length > 0 ? boundsOf(list) : drawn ? areaBounds(drawn) : null;
    if (!target) return;

    // A marker's label is anchored under its point and spreads sideways, so
    // the horizontal padding has to clear half a price pill or the easternmost
    // room loses its price off the edge. The left is wider still, to keep the
    // campus and its pins out from under the Options and Draw buttons.
    map.fitBounds(target, { top: 40, right: 64, bottom: 48, left: 104 });
    // A single room fits to a point, which Maps reads as maximum zoom.
    if (list.length === 1 && (map.getZoom() ?? 0) > 16) map.setZoom(16);
  }, []);

  // The boundary lives in the URL, so drawing one is a navigation like any
  // other filter change: shareable, reloadable, and undone by the back button.
  const applyArea = useCallback(
    (points: AreaPoint[] | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (points) params.set("area", encodeArea(points));
      else params.delete("area");
      const query = params.toString();
      router.push(query ? `/search?${query}` : "/search");
    },
    [router, searchParams],
  );

  // Build the map once. Markers and overlays are attached by the effects below.
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    loadMapClasses(apiKey)
      .then(({ Map, AdvancedMarkerElement, Polygon }) => {
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

        // Campus, drawn under everything. Not clickable, so it never eats a
        // click meant for a pin or for the boundary tool.
        new Polygon({
          map,
          paths: NTU_CAMPUS_OUTLINE,
          strokeColor: ACCENT,
          strokeOpacity: 0.75,
          strokeWeight: 1.5,
          fillColor: ACCENT,
          fillOpacity: 0.1,
          clickable: false,
          zIndex: 0,
        });

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

  useEffect(() => {
    if (status !== "ready") return;
    // "hybrid" rather than "satellite": imagery with no street names is
    // useless for judging where a room is.
    mapRef.current?.setMapTypeId(
      mapType === "satellite" ? "hybrid" : "roadmap",
    );
  }, [mapType, status]);

  // The boundary currently applied, redrawn whenever the URL changes.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;
    if (!area) return;

    let cancelled = false;
    let overlay: GPathOverlay | null = null;

    loadMapClasses(apiKey).then(({ Polygon }) => {
      if (cancelled) return;
      overlay = new Polygon({
        map,
        paths: area,
        strokeColor: BRAND,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: BRAND,
        fillOpacity: 0.07,
        clickable: false,
        zIndex: 1,
      });
    });

    return () => {
      cancelled = true;
      overlay?.setMap(null);
    };
    // `area` is derived from areaParam, which is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaParam, status, apiKey]);

  // Draw mode. Freehand rather than click-per-vertex: "the area I want" is a
  // gesture, not a list of corners. Panning is switched off for the duration
  // so a drag draws instead of moving the map.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map || !drawing) return;

    let cancelled = false;
    let line: GPathOverlay | null = null;
    let points: AreaPoint[] = [];
    let tracking = false;
    const subs: GMapsListener[] = [];

    map.setOptions({
      draggable: false,
      gestureHandling: "none",
      disableDoubleClickZoom: true,
      draggableCursor: "crosshair",
    });

    loadMapClasses(apiKey).then(({ Polyline }) => {
      if (cancelled) return;
      line = new Polyline({
        map,
        path: [],
        strokeColor: BRAND,
        strokeOpacity: 0.95,
        strokeWeight: 3,
        clickable: false,
        zIndex: 5,
      });

      subs.push(
        map.addListener("mousedown", (e) => {
          tracking = true;
          points = [{ lat: e.latLng.lat(), lng: e.latLng.lng() }];
          line?.setPath(points);
        }),
      );

      subs.push(
        map.addListener("mousemove", (e) => {
          if (!tracking) return;
          const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          // Thinning as we go rather than afterwards: a slow drag emits a
          // point per pixel, and the polyline redraws on each one.
          if (metersBetween(points[points.length - 1], next) < DRAW_MIN_SPACING_M) {
            return;
          }
          points.push(next);
          line?.setPath(points);
        }),
      );

      subs.push(
        map.addListener("mouseup", () => {
          if (!tracking) return;
          tracking = false;
          // A click rather than a drag. Treat it as a miss and let them retry
          // instead of filtering the page down to nothing.
          if (points.length < 3) {
            line?.setPath([]);
            return;
          }
          setDrawing(false);
          applyArea(thin(points));
        }),
      );
    });

    return () => {
      cancelled = true;
      for (const sub of subs) sub.remove();
      line?.setMap(null);
      map.setOptions({
        draggable: true,
        gestureHandling: "greedy",
        disableDoubleClickZoom: false,
        draggableCursor: null,
      });
    };
  }, [drawing, status, apiKey, applyArea]);

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
    // `pins` is intentionally absent: pinKey is its stable identity. areaParam
    // is here for the one case pinKey misses - a boundary redrawn from no
    // results to no results, where only the shape to frame has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, apiKey, pinKey, areaParam, fitToPins]);

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
        <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
          <MapOptions mapType={mapType} onMapType={setMapType} />
          <DrawBoundaryControl
            drawing={drawing}
            hasArea={area != null}
            onStart={() => setDrawing(true)}
            onCancel={() => setDrawing(false)}
            onClear={() => applyArea(null)}
          />
        </div>
      )}

      {drawing && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-20">
          <p className="rounded-full bg-ink/85 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-[0_2px_10px_rgba(28,26,23,0.25)]">
            Drag on the map to draw the area you want
          </p>
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted">
          <span className="text-xs text-ink-faint">Loading map...</span>
        </div>
      )}

      {selected && !drawing && (
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
