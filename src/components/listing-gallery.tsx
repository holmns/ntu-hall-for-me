"use client";

import { useState } from "react";

import type { ListingImageView } from "@/lib/images";

/**
 * Photo gallery on the listing detail page.
 *
 * Alt text comes from the stored value rather than the listing title: titles
 * are redacted in public views, so building alt text from one would put the
 * block or unit number back into the markup.
 */
export function ListingGallery({ images }: { images: ListingImageView[] }) {
  const [active, setActive] = useState(0);

  if (images.length === 0) return null;

  const index = Math.min(active, images.length - 1);
  const current = images[index];
  const step = (delta: number) =>
    setActive((prev) => (prev + delta + images.length) % images.length);

  return (
    <section aria-label="Photos">
      <div className="group relative aspect-[3/2] overflow-hidden rounded-xl border border-line bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.id}
          src={current.url}
          alt={current.alt}
          width={current.width}
          height={current.height}
          className="h-full w-full object-cover"
        />

        {images.length > 1 && (
          <>
            <Arrow
              direction="left"
              label="Previous photo"
              onClick={() => step(-1)}
            />
            <Arrow
              direction="right"
              label="Next photo"
              onClick={() => step(1)}
            />
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md bg-ink/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={`block h-14 w-20 overflow-hidden rounded-md border transition-colors ${
                  i === index
                    ? "border-brand ring-2 ring-brand-soft"
                    : "border-line opacity-75 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Arrow({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-surface/85 text-ink shadow-[0_1px_6px_rgba(28,26,23,0.18)] transition-opacity hover:bg-surface focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
        direction === "left" ? "left-2.5" : "right-2.5"
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
