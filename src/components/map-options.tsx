"use client";

import { useEffect, useRef, useState } from "react";

import {
  MAP_LAYERS,
  type MapLayer,
  type MapLayerState,
} from "@/lib/map-styles";

export type MapType = "default" | "satellite";

const BUTTON =
  "flex w-[62px] flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-semibold shadow-[0_2px_10px_rgba(28,26,23,0.22)] transition-colors";

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
  layers,
  onLayer,
}: {
  mapType: MapType;
  onMapType: (value: MapType) => void;
  layers: MapLayerState;
  onLayer: (id: MapLayer, visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Styles apply to the road map only. Imagery carries its own baked-in
  // labels, so these rows are disabled rather than left looking live and
  // doing nothing.
  const onImagery = mapType === "satellite";

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
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${BUTTON} ${
          open ? "bg-brand text-bone" : "bg-surface text-ink-soft hover:text-ink"
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
        <div className="absolute left-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface p-3.5 shadow-[0_8px_28px_rgba(28,26,23,0.18)]">
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

          <p className="mt-3.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Show on map
          </p>
          <div className="mt-1 flex flex-col">
            {MAP_LAYERS.map(({ id, label }) => {
              const visible = layers[id];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={onImagery}
                  aria-pressed={visible}
                  onClick={() => onLayer(id, !visible)}
                  className={`-mx-1 flex items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-[12px] transition-colors ${
                    onImagery
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-surface-muted"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                      visible
                        ? "border-brand bg-brand text-bone"
                        : "border-line-strong bg-surface"
                    }`}
                  >
                    {visible && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-ink">{label}</span>
                </button>
              );
            })}
          </div>
          {onImagery && (
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">
              Satellite labels come with the imagery, so these apply to the
              default map.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Start, cancel or clear a hand-drawn search boundary.
 *
 * Redraw is its own button rather than "clear, then draw again": the boundary
 * lives in the URL, so the two-step version would cost a second full search
 * for a shape the seeker is about to replace anyway.
 *
 * Drawing is a mouse gesture and hides below `lg` - the phone map is 320px
 * tall and the drag is driven by the Maps mouse events, which is not something
 * to hand a touchscreen unverified. Clear stays visible at every width, so a
 * shared link with a boundary in it is never a dead end on a phone.
 */
export function DrawBoundaryControl({
  drawing,
  hasArea,
  onStart,
  onCancel,
  onClear,
}: {
  drawing: boolean;
  hasArea: boolean;
  onStart: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  if (drawing) {
    return (
      <button
        type="button"
        onClick={onCancel}
        className={`${BUTTON} hidden bg-brand text-bone lg:flex`}
      >
        <PencilIcon />
        Cancel
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onStart}
        className={`${BUTTON} hidden bg-surface text-ink-soft hover:text-ink lg:flex`}
      >
        <PencilIcon />
        {hasArea ? "Redraw" : "Draw"}
      </button>
      {hasArea && (
        <button
          type="button"
          onClick={onClear}
          className={`${BUTTON} bg-surface text-brand-ink hover:text-brand-hover`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          Clear
        </button>
      )}
    </>
  );
}

function PencilIcon() {
  return (
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
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
