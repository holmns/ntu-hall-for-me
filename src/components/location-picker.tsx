"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_MAP_ID,
  loadMapClasses,
  toLatLngLiteral,
  type GAdvancedMarker,
  type GMap,
} from "@/lib/maps-client";

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
 * Draggable pin for fine-tuning a listing's exact location.
 *
 * Places gives a building-level point, which is often the wrong block in an
 * HDB estate. The provider drags the pin to the actual block; that coordinate
 * drives the commute calculation and the public map circle.
 *
 * The server re-resolves the placeId and only accepts an adjusted pin within
 * MAX_ADJUST_M of it, so a hand-edited hidden field cannot place a listing on
 * the other side of Singapore.
 */
export function LocationPicker({
  value,
  onChange,
  disabled,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number }, adjusted: boolean) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GAdvancedMarker | null>(null);
  // Kept in a ref so the map is built once and never rebuilt when the parent
  // re-renders with a new callback identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Required, so an empty key is just another way for the loader to fail.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [moved, setMoved] = useState(false);

  // Build the map once, then drive it imperatively via the value effect below.
  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    loadMapClasses(apiKey)
      .then(({ Map, AdvancedMarkerElement }) => {
        if (cancelled || !ref.current) return;

        const start = value ?? NTU;
        const map = new Map(ref.current, {
          center: start,
          zoom: value ? 17 : 13,
          mapId: DEFAULT_MAP_ID,
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
          gestureHandling: "cooperative",
        });
        mapRef.current = map;

        const marker = new AdvancedMarkerElement({
          map,
          position: start,
          gmpDraggable: true,
          title: "Drag to the exact block",
        });
        markerRef.current = marker;

        const commit = (point: { lat: number; lng: number }) => {
          marker.position = point;
          setMoved(true);
          onChangeRef.current(point, true);
        };
        // Advanced markers move themselves during a drag; the dragend event
        // carries no latLng, so read the marker's own position back instead.
        marker.addListener("dragend", () => {
          const point = toLatLngLiteral(marker.position);
          if (point) commit(point);
        });
        map.addListener("click", (e) => {
          commit({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });

        new AdvancedMarkerElement({
          map,
          position: NTU,
          title: "NTU main campus",
          content: ntuMarkerDot(),
        });

        setStatus("ready");
      })
      .catch((error) => {
        console.error("[location-picker] failed to initialise:", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: `value` changes are applied by the next effect
    // so that picking a new address does not tear down and rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Recentre when a new address is chosen from autocomplete.
  useEffect(() => {
    if (!value || !mapRef.current || !markerRef.current) return;
    markerRef.current.position = value;
    mapRef.current.panTo(value);
    mapRef.current.setZoom(17);
    setMoved(false);
  }, [value]);

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted px-4 py-5 text-center">
        <p className="text-[13px] font-medium text-ink-soft">
          Map picker could not be loaded
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {value
            ? `Using the address coordinates: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : "Pick an address above and its coordinates will be used."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-64 overflow-hidden rounded-xl border border-line">
        <div ref={ref} className="h-full w-full" />
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-surface-muted">
            <span className="text-xs text-ink-faint">Loading map...</span>
          </div>
        )}
        {disabled && status === "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-surface/75 px-6 text-center">
            <span className="text-[13px] font-medium text-ink-soft">
              Pick an address above to place the pin
            </span>
          </div>
        )}
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-ink-faint">
        <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden="true">
          <path d="M8 0a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
        </svg>
        <span>
          {moved
            ? "Pin moved. This exact point is used for the commute calculation, and only an approximate area is shown publicly."
            : "Drag the pin (or click the map) to mark the exact block. The address text above stays as you selected it."}
        </span>
      </p>
    </div>
  );
}
