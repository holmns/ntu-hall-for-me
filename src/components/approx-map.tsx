"use client";

import { useEffect, useRef, useState } from "react";

const NTU = { lat: 1.3483, lng: 103.6831 };

/**
 * Minimal structural type for the slice of the Maps JS API used here, so we
 * avoid pulling in @types/google.maps for one map.
 */
type MapCtor = new (el: HTMLElement, opts: Record<string, unknown>) => object;
type OverlayCtor = new (opts: Record<string, unknown>) => object;

type MapsLibrary = { Map: MapCtor; Circle: OverlayCtor };
type MarkerLibrary = { Marker: OverlayCtor };

type MapsNamespace = MapsLibrary &
  MarkerLibrary & { SymbolPath: { CIRCLE: unknown } };

function getMapsNamespace(): MapsNamespace | null {
  const ns = (globalThis as { google?: { maps?: MapsNamespace } }).google?.maps;
  return ns?.Map ? ns : null;
}

const CALLBACK_NAME = "__ntuRoomFinderMapsReady";
let mapsLoader: Promise<void> | null = null;

/**
 * Injects the Maps JS API once per page.
 *
 * Uses the `callback` parameter rather than the script's `onload`: with
 * `loading=async`, onload fires before the namespace is populated, so
 * `google.maps.Map` is still undefined at that point. Google only guarantees
 * the classes exist once `callback` fires.
 */
function loadMapsApi(apiKey: string): Promise<void> {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (getMapsNamespace()) return resolve();

    const timer = setTimeout(
      () => reject(new Error("Google Maps timed out")),
      15_000,
    );
    (window as unknown as Record<string, unknown>)[CALLBACK_NAME] = () => {
      clearTimeout(timer);
      resolve();
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=maps,marker&loading=async&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Failed to load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

async function loadMapClasses(apiKey: string): Promise<MapsNamespace> {
  await loadMapsApi(apiKey);
  const ns = getMapsNamespace();
  if (!ns) throw new Error("Maps namespace did not initialise");
  return ns;
}

/**
 * Shows the jittered approximate location, never the exact pin. The radius
 * circle makes the imprecision explicit rather than implying false accuracy.
 */
export function ApproxMap({
  lat,
  lng,
  exact = false,
}: {
  lat: number;
  lng: number;
  exact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Derived, not set in an effect: without a key the map can never load.
  // "no-key" and "failed" are distinct: one is unconfigured, one is broken.
  const [status, setStatus] = useState<
    "loading" | "ready" | "no-key" | "failed"
  >(apiKey ? "loading" : "no-key");

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;

    loadMapClasses(apiKey)
      .then(({ Map, Circle, Marker, SymbolPath }) => {
        if (cancelled || !ref.current) return;

        const map = new Map(ref.current, {
          center: { lat, lng },
          zoom: exact ? 16 : 14,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });

        if (exact) {
          new Marker({ map, position: { lat, lng } });
        } else {
          new Circle({
            map,
            center: { lat, lng },
            // Must stay >= the max jitter in approximateLocation() so the true
            // point is always somewhere inside the drawn circle.
            radius: 600,
            strokeColor: "#b3202f",
            strokeOpacity: 0.5,
            strokeWeight: 1.5,
            fillColor: "#b3202f",
            fillOpacity: 0.12,
          });
        }

        new Marker({
          map,
          position: NTU,
          title: "NTU main campus",
          icon: {
            path: SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#0f766e",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });

        setStatus("ready");
      })
      .catch((error) => {
        console.error("[map] failed to initialise:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, lat, lng, exact]);

  if (status === "no-key" || status === "failed") {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-muted px-6 text-center">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-ink-faint"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        </svg>
        <p className="text-[13px] font-medium text-ink-soft">
          {status === "no-key"
            ? "Map needs a Maps API key"
            : "Map could not be loaded"}
        </p>
        <p className="text-xs text-ink-faint">
          {status === "no-key"
            ? "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render the pin."
            : "Check that the Maps JavaScript API is enabled and the key allows this referrer."}{" "}
          {exact ? "Exact" : "Approximate"} location: {lat.toFixed(4)},{" "}
          {lng.toFixed(4)}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-56 overflow-hidden rounded-xl border border-line">
      <div ref={ref} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted">
          <span className="text-xs text-ink-faint">Loading map...</span>
        </div>
      )}
    </div>
  );
}
