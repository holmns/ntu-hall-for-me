"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MapType = "default" | "satellite";
export type PoiLayer = "restaurants" | "transit" | "neighbourhoods" | "none";

/** Layers backed by the paid Places proxy, which needs a signed-in user. */
const NEEDS_ACCOUNT: PoiLayer[] = ["restaurants", "transit"];

const POI_OPTIONS: { value: PoiLayer; label: string }[] = [
  { value: "restaurants", label: "Restaurants" },
  { value: "transit", label: "Transit" },
  { value: "neighbourhoods", label: "Neighbourhoods" },
  { value: "none", label: "None" },
];

/**
 * The map's own settings, overlaid on its top-left corner.
 *
 * Deliberately a panel behind one button rather than a row of controls: the
 * map is the largest thing on the page and every pixel of chrome is a pixel of
 * rooms not shown.
 */
export function MapOptions({
  mapType,
  onMapType,
  poi,
  onPoi,
  signedIn,
  poiStatus,
  poiCount,
}: {
  mapType: MapType;
  onMapType: (value: MapType) => void;
  poi: PoiLayer;
  onPoi: (value: PoiLayer) => void;
  signedIn: boolean;
  poiStatus: "idle" | "loading" | "failed";
  poiCount: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="absolute left-3 top-3 z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-[62px] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-semibold shadow-[0_2px_10px_rgba(28,26,23,0.22)] transition-colors ${
          open
            ? "bg-brand text-white"
            : "bg-surface text-ink-soft hover:text-ink"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
        Options
      </button>

      {open && (
        <div className="mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_8px_28px_rgba(28,26,23,0.18)]">
          <div className="px-3.5 pb-3 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Map
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1">
              {(["default", "satellite"] as MapType[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onMapType(value)}
                  aria-pressed={mapType === value}
                  className={`rounded-md py-1.5 text-[12px] font-medium capitalize transition-colors ${
                    mapType === value
                      ? "bg-surface text-ink shadow-[0_1px_3px_rgba(28,26,23,0.12)]"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-line px-3.5 pb-3 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Nearby points of interest
            </p>
            <div className="mt-1.5 space-y-0.5">
              {POI_OPTIONS.map((option) => {
                const locked = !signedIn && NEEDS_ACCOUNT.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] ${
                      locked
                        ? "cursor-not-allowed text-ink-faint"
                        : "cursor-pointer text-ink-soft hover:bg-surface-muted hover:text-ink"
                    }`}
                  >
                    <input
                      type="radio"
                      name="poi-layer"
                      value={option.value}
                      checked={poi === option.value}
                      disabled={locked}
                      onChange={() => onPoi(option.value)}
                      className="h-3.5 w-3.5 accent-brand"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>

            <PoiNote
              signedIn={signedIn}
              poi={poi}
              status={poiStatus}
              count={poiCount}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** One line of feedback, so a layer that found nothing does not read as broken. */
function PoiNote({
  signedIn,
  poi,
  status,
  count,
}: {
  signedIn: boolean;
  poi: PoiLayer;
  status: "idle" | "loading" | "failed";
  count: number;
}) {
  if (!signedIn) {
    return (
      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-faint">
        <Link
          href="/signin?callbackUrl=/search"
          className="font-medium text-brand hover:underline"
        >
          Sign in
        </Link>{" "}
        for restaurants and transit. Neighbourhoods works either way.
      </p>
    );
  }
  if (poi === "none") return null;
  if (status === "loading") {
    return (
      <p className="mt-2 border-t border-line pt-2 text-[11px] text-ink-faint">
        Looking around the map...
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-brand">
        Could not load nearby places. Try again in a moment.
      </p>
    );
  }
  return (
    <p className="mt-2 border-t border-line pt-2 text-[11px] text-ink-faint">
      {count === 0
        ? "Nothing found in this area."
        : `${count} shown for the current view.`}
    </p>
  );
}
