"use client";

import { useEffect, useRef, useState } from "react";

const NTU = { lat: 1.3483, lng: 103.6831 };

let mapsLoader: Promise<void> | null = null;

/** Loads the Maps JS API once per page, shared across component instances. */
function loadMapsApi(apiKey: string): Promise<void> {
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    const w = window as unknown as { google?: { maps?: unknown } };
    if (w.google?.maps) return resolve();

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=maps&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsLoader;
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
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setStatus("unavailable");
      return;
    }
    let cancelled = false;

    loadMapsApi(apiKey)
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google: any }).google;

        const map = new g.maps.Map(ref.current, {
          center: { lat, lng },
          zoom: exact ? 16 : 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });

        if (exact) {
          new g.maps.Marker({ map, position: { lat, lng } });
        } else {
          new g.maps.Circle({
            map,
            center: { lat, lng },
            radius: 350,
            strokeColor: "#b3202f",
            strokeOpacity: 0.5,
            strokeWeight: 1.5,
            fillColor: "#b3202f",
            fillOpacity: 0.12,
          });
        }

        new g.maps.Marker({
          map,
          position: NTU,
          title: "NTU main campus",
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#0f766e",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, lat, lng, exact]);

  if (status === "unavailable") {
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
          Map needs a Maps API key
        </p>
        <p className="text-xs text-ink-faint">
          Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to render the pin.{" "}
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
