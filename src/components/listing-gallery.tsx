"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ListingImageView } from "@/lib/images";

/**
 * Photo gallery on the listing detail page.
 *
 * Alt text comes from the stored value rather than the listing title, which is
 * edited independently and would leave the markup describing an older version
 * of the listing.
 */
export function ListingGallery({ images }: { images: ListingImageView[] }) {
  const [active, setActive] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  const index = Math.min(active, Math.max(images.length - 1, 0));
  const step = useCallback(
    (delta: number) =>
      setActive((prev) => (prev + delta + images.length) % images.length),
    [images.length],
  );

  const close = useCallback(() => {
    setExpanded(false);
    // Back to the control that opened it, or the reader is dropped at the top
    // of the document with no idea where their place went.
    openerRef.current?.focus();
  }, []);

  // Bound only while open, so the listing page keeps its arrow keys for
  // scrolling the rest of the time.
  useEffect(() => {
    if (!expanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else return;
      event.preventDefault();
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under the overlay.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [expanded, close, step]);

  if (images.length === 0) return null;

  const current = images[index];

  return (
    <section aria-label="Photos">
      <div className="group relative aspect-[3/2] overflow-hidden rounded-xl border border-line bg-surface-muted">
        {/* The photo is the control. A room photo you cannot look at closely
            is the one thing on this page nobody can work around. */}
        <button
          type="button"
          ref={openerRef}
          onClick={() => setExpanded(true)}
          aria-label={`Open photo ${index + 1} full size`}
          className="block h-full w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={current.url}
            alt={current.alt}
            width={current.width}
            height={current.height}
            className="h-full w-full object-cover"
          />
        </button>

        <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-lg bg-surface/90 px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-[0_1px_6px_rgba(28,26,23,0.18)] backdrop-blur-[2px]">
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M1.5 1.5h5v2h-3v3h-2v-5Zm8 0h5v5h-2v-3h-3v-2Zm-8 8h2v3h3v2h-5v-5Zm11 0h2v5h-5v-2h3v-3Z" />
          </svg>
          {images.length > 1 ? `Show all ${images.length} photos` : "Show photo"}
        </span>

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

      {expanded && (
        // Deliberately not <dialog>: showModal() brings a focus trap and its
        // own Escape handling, but it also renders in the top layer where the
        // app's tokens and theming do not reach cleanly. Focus and Escape are
        // small enough to own.
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photos"
          onClick={(event) => {
            // Only the backdrop itself. A click that lands on the photo or the
            // controls is not a click outside them.
            if (event.target === event.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
            <span className="text-[13px] font-medium tabular-nums text-white/80">
              {index + 1} / {images.length}
            </span>
            <button
              type="button"
              ref={closeRef}
              onClick={close}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close photos"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            {/* object-contain, not cover: the whole point of opening a photo
                is to see the parts the card cropped off. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={current.url}
              alt={current.alt}
              className="max-h-full max-w-full rounded-lg object-contain"
            />

            {images.length > 1 && (
              <>
                <LightboxArrow
                  direction="left"
                  label="Previous photo"
                  onClick={() => step(-1)}
                />
                <LightboxArrow
                  direction="right"
                  label="Next photo"
                  onClick={() => step(1)}
                />
              </>
            )}
          </div>

          {images.length > 1 && (
            <ul className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3">
              {images.map((image, i) => (
                <li key={image.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-current={i === index}
                    className={`block h-12 w-16 overflow-hidden rounded-md border transition-opacity ${
                      i === index
                        ? "border-white opacity-100"
                        : "border-white/25 opacity-60 hover:opacity-100"
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
        </div>
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
      <Chevron direction={direction} />
    </button>
  );
}

/** Always visible, unlike the hero's: there is no hover on a phone and the
 *  lightbox is where stepping through photos is the whole activity. */
function LightboxArrow({
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
      className={`absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 ${
        direction === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6"
      }`}
    >
      <Chevron direction={direction} />
    </button>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
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
  );
}
