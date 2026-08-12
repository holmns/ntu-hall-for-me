"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_MAP_ID, loadMapClasses } from "@/lib/maps-client";

const NTU = { lat: 1.3483, lng: 103.6831 };

function ntuMarkerDot(): HTMLElement {
  const dot = document.createElement("div");
  dot.style.width = "12px";
  dot.style.height = "12px";
  dot.style.borderRadius = "50%";
  dot.style.backgroundColor = "#0f766e";
  dot.style.border = "2px solid #ffffff";
  dot.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.15)";
  return dot;
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
  // Required, so an empty key is just another way for the loader to fail.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;

    loadMapClasses(apiKey)
      .then(({ Map, Circle, AdvancedMarkerElement }) => {
        if (cancelled || !ref.current) return;

        const map = new Map(ref.current, {
          center: { lat, lng },
          zoom: exact ? 16 : 14,
          mapId: DEFAULT_MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });

        if (exact) {
          new AdvancedMarkerElement({ map, position: { lat, lng } });
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

        new AdvancedMarkerElement({
          map,
          position: NTU,
          title: "NTU main campus",
          content: ntuMarkerDot(),
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

  if (status === "failed") {
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
          Map could not be loaded
        </p>
        <p className="text-xs text-ink-faint">
          Check that NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the Maps JavaScript
          API is enabled, and the key allows this referrer.{" "}
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
