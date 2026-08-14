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

/**
 * One item in a card's meta row, carrying the separator that precedes it.
 *
 * A slash rendered as its own flex child is its own wrap opportunity, so
 * whenever the item after it dropped to the next line the slash stayed behind
 * and the row read "Single room / On-campus sublet /" with nothing after it.
 * Bound to the item it introduces, the separator travels with it.
 */
function MetaItem({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      {children}
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
 * How long a room has been up.
 *
 * The standard proxy for "is this still going", and it matters more here than
 * on a general rental site: sublets are semester-driven, so a room posted in
 * March is far more likely to be gone than a flat listed in March would be.
 * Exact dates past a month, because "63 days ago" is arithmetic, not an answer.
 */
function listedAgo(createdAt: Date): string {
  const days = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  if (days <= 0) return "Listed today";
  if (days === 1) return "Listed yesterday";
  if (days < 7) return `Listed ${days} days ago`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return `Listed ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  return `Listed ${createdAt.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
  })}`;
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

  const head = (
    <div className="min-w-0">
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

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-soft">
        <span>{ROOM_TYPE_LABELS[listing.roomType]}</span>
        <MetaItem>{CATEGORY_LABELS[listing.category]}</MetaItem>
        <MetaItem>
          <CommuteBadge listing={listing} mode={mode} />
        </MetaItem>
        <MetaItem>
          <span className="text-ink-faint">{listedAgo(listing.createdAt)}</span>
        </MetaItem>
      </div>

    </div>
  );

  // Outside `head`, so in the row layout it spans the whole card rather than
  // only the text column. Tags are the most wrappable thing on a card and the
  // narrowest column is the worst place to wrap them - and running them under
  // the cover is what fills the space the cover leaves behind.
  const tagRow = tags.length > 0 && (
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
  );

  // Only past one photo. A "1" would be telling the reader what they can
  // already see, and the badge exists to say there is more behind the cover.
  const photoCount = listing.images.length > 1 && (
    <span className="pointer-events-none inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums backdrop-blur-[2px]">
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6 2.5a1 1 0 0 0-.8.4L4.5 4H2.8A1.8 1.8 0 0 0 1 5.8v6.4A1.8 1.8 0 0 0 2.8 14h10.4a1.8 1.8 0 0 0 1.8-1.8V5.8A1.8 1.8 0 0 0 13.2 4h-1.7l-.7-1.1a1 1 0 0 0-.8-.4H6Zm2 3.7a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8Z" />
      </svg>
      {listing.images.length}
      <span className="sr-only"> photos</span>
    </span>
  );

  // Laid over the cover in both layouts. In the row it used to sit in the flex
  // line, where the chip and its gap cost 40px of a text column that had 129px
  // to give at the lg breakpoint.
  const rankChip = rank != null && (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand tabular-nums shadow-[0_1px_3px_rgba(28,26,23,0.14)]">
      {rank}
    </span>
  );

  return (
    // Not a <Link> wrapper: the save button is interactive and cannot be
    // nested inside an anchor, so the link is stretched over the card instead
    // and the button sits above it.
    <article
      className={`card group relative @container transition-all hover:border-line-strong hover:shadow-[0_2px_12px_rgba(28,26,23,0.06)] ${
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
            {rankChip && (
              <div className="absolute left-2 top-2 z-10">{rankChip}</div>
            )}
            {photoCount && (
              <div className="absolute bottom-2 right-2 z-10">{photoCount}</div>
            )}
          </div>
          <div className="p-4">
            {head}
            {reason}
            {tagRow}
          </div>
        </>
      ) : (
        <>
          {/* Grid rather than a flex line, so the reason can change column
              without changing place in the DOM.

              Track one is a proportion of the card, not a fixed 200px. The
              results column is itself a proportion of the viewport and bottoms
              out around 380px, where a fixed cover plus the rank chip left
              129px for the title, the price and the commute - and the card's
              own min-content grew past the column, so the price was clipped
              off its right edge entirely.

              Row gaps are zero on purpose: the reason and the tag row carry
              their own top margin, which is what keeps their spacing identical
              in the stacked layout, where there is no grid at all. */}
          <div className="grid grid-cols-[minmax(104px,min(32%,200px))_minmax(0,1fr)] items-start gap-x-3 gap-y-0 sm:gap-x-4">
            {/* Spans the text rows on a wide card so they size to the text
                rather than stacking below the photo. Row gaps are zero, so
                spanning more rows than exist costs nothing. */}
            <div className="relative @md:row-span-3">
              <CardCover
                listing={listing}
                box="aspect-[4/3] w-full overflow-hidden rounded-lg border border-line"
              />
              {save && <div className="absolute right-1 top-1 z-10">{save}</div>}
              {rankChip && (
                <div className="absolute left-1 top-1 z-10">{rankChip}</div>
              )}
              {photoCount && (
                <div className="absolute bottom-1 right-1 z-10">{photoCount}</div>
              )}
            </div>

            {head}

            {/* Beside the cover once the card is wide enough, underneath it
                when it is not. A wide card has a short text column - one line
                of title, one of meta - so the reason is what fills the cover's
                height; a narrow card has a tall one, and the reason sitting in
                it left the space under the cover empty and the measure too
                narrow to read. */}
            {reason && (
              <div className="col-span-2 min-w-0 @md:col-span-1 @md:col-start-2">
                {reason}
              </div>
            )}

            {tagRow && (
              <div className="col-span-2 min-w-0 @md:col-span-1 @md:col-start-2">
                {tagRow}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
