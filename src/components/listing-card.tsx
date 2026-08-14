import Link from "next/link";
import type { ReactNode } from "react";

import {
  CATEGORY_LABELS,
  ROOM_TYPE_LABELS,
  TAG_LABELS,
  TRAVEL_MODE_LABELS,
} from "@/lib/constants";
import { commuteMinutes, type TravelMode } from "@/lib/matching";
import type { ListingTag } from "@/generated/prisma/enums";
import type { ListingWithProvider } from "@/lib/matching";

export function TagPill({ tag }: { tag: ListingTag }) {
  return (
    <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs text-ink-soft">
      {TAG_LABELS[tag]}
    </span>
  );
}

export function CommuteBadge({
  listing,
  mode,
}: {
  listing: ListingWithProvider;
  mode: TravelMode;
}) {
  if (listing.category === "ON_CAMPUS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
        On campus
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 text-ink-faint"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
      {commuteMinutes(listing, mode)} min {TRAVEL_MODE_LABELS[mode]} to NTU
    </span>
  );
}

/**
 * Cover photo, or a neutral placeholder so a listing without one still lines
 * up with the listings that have them. The caller owns the box: a row card
 * wants a fixed rounded panel beside the text, a stacked card wants the photo
 * running full-bleed to the card's own edges.
 */
function CardCover({
  listing,
  box,
}: {
  listing: ListingWithProvider;
  box: string;
}) {
  const cover = listing.images[0];

  if (!cover) {
    return (
      <div className={`${box} grid place-items-center bg-surface-muted`}>
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7 text-line-strong"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="m4 17 4.5-4.5L12 16l3-3 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${box} bg-surface-muted`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.url}
        alt={cover.alt}
        width={cover.width}
        height={cover.height}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}

/**
 * The highlighted "why this room" line. Exported so the caller owns whether it
 * renders at all: reasons arrive after the card does, so the search page passes
 * a Suspense boundary here, and a listing the model skipped renders nothing
 * rather than an empty pill.
 */
export function ReasonPill({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex gap-2 rounded-lg bg-brand-soft/70 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
      <svg
        viewBox="0 0 16 16"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0.5l1.9 4.3 4.6.5-3.4 3.1 1 4.6L8 10.7l-4.1 2.3 1-4.6L1.5 5.3l4.6-.5L8 .5Z" />
      </svg>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export function ListingCard({
  listing,
  reason,
  rank,
  mode = "transit",
  save,
  unavailable = false,
  layout = "row",
}: {
  listing: ListingWithProvider;
  /** Already wrapped in `ReasonPill` by the caller, or absent. */
  reason?: ReactNode;
  rank?: number;
  mode?: TravelMode;
  /** A `SaveButton`, laid over the cover. Absent leaves the card as it was. */
  save?: ReactNode;
  /** Withdrawn since it was saved. Only `/saved` ever renders one of these. */
  unavailable?: boolean;
  /**
   * `row` is the browse list: photo beside the text, so a tall column shows
   * several rooms at once. `stacked` puts the photo on top at full bleed, for
   * the wide grids where there is room to lead with it.
   */
  layout?: "row" | "stacked";
}) {
  const tags = listing.tags as ListingTag[];
  const stacked = layout === "stacked";

  const body = (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-[15px] font-semibold leading-snug text-ink group-hover:text-brand">
          {listing.title}
          {unavailable && (
            <span className="ml-2 whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 align-middle text-[11px] font-medium text-ink-faint">
              No longer listed
            </span>
          )}
        </h3>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold tabular-nums text-ink">
            ${listing.price.toLocaleString()}
          </div>
          <div className="text-[11px] text-ink-faint">per month</div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span>{ROOM_TYPE_LABELS[listing.roomType]}</span>
        <span className="text-line-strong">/</span>
        <span>{CATEGORY_LABELS[listing.category]}</span>
        <span className="text-line-strong">/</span>
        <CommuteBadge listing={listing} mode={mode} />
      </div>

      {reason}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 5).map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
          {tags.length > 5 && (
            <span className="self-center text-xs text-ink-faint">
              +{tags.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  );

  const rankChip = rank != null && (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand tabular-nums">
      {rank}
    </span>
  );

  return (
    // Not a <Link> wrapper: the save button is interactive and cannot be
    // nested inside an anchor, so the link is stretched over the card instead
    // and the button sits above it.
    <article
      className={`card group relative transition-all hover:border-line-strong hover:shadow-[0_2px_12px_rgba(28,26,23,0.06)] ${
        // Stacked runs the photo to the card's own edges, which needs the
        // rounding clipped and the padding moved onto the text block.
        stacked ? "overflow-hidden" : "p-4 sm:p-5"
      }`}
    >
      <Link
        href={`/listings/${listing.id}`}
        className="absolute inset-0 rounded-card"
      >
        <span className="sr-only">{listing.title}</span>
      </Link>

      {stacked ? (
        <>
          <div className="relative">
            <CardCover
              listing={listing}
              box="aspect-[3/2] w-full overflow-hidden border-b border-line"
            />
            {save && <div className="absolute right-2 top-2 z-10">{save}</div>}
            {rankChip && <div className="absolute left-2 top-2 z-10">{rankChip}</div>}
          </div>
          <div className="p-4">{body}</div>
        </>
      ) : (
        <div className="flex items-start gap-3 sm:gap-4">
          {rankChip && <div className="mt-0.5">{rankChip}</div>}
          <div className="relative shrink-0">
            <CardCover
              listing={listing}
              box="h-[104px] w-[136px] shrink-0 overflow-hidden rounded-lg border border-line sm:h-[150px] sm:w-[200px]"
            />
            {save && <div className="absolute right-1 top-1 z-10">{save}</div>}
          </div>
          {body}
        </div>
      )}
    </article>
  );
}
