import Link from "next/link";

import { CATEGORY_LABELS, ROOM_TYPE_LABELS, TAG_LABELS } from "@/lib/constants";
import { commuteMinutes, type TravelMode } from "@/lib/matching";
import { redactLocationDetails } from "@/lib/redaction";
import type { ListingTag } from "@/generated/prisma/enums";
import type { ListingWithProvider } from "@/lib/matching";

const MODE_LABEL: Record<TravelMode, string> = {
  walking: "walk",
  transit: "by bus/MRT",
  driving: "drive",
};

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
      {commuteMinutes(listing, mode)} min {MODE_LABEL[mode]} to NTU
    </span>
  );
}

export function ListingCard({
  listing,
  reason,
  rank,
  mode = "transit",
}: {
  listing: ListingWithProvider;
  reason?: string;
  rank?: number;
  mode?: TravelMode;
}) {
  const tags = listing.tags as ListingTag[];

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="card group block p-4 transition-all hover:border-line-strong hover:shadow-[0_2px_12px_rgba(28,26,23,0.06)] sm:p-5"
    >
      <div className="flex items-start gap-3">
        {rank != null && (
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand tabular-nums">
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            {/* Cards are always a public view, so the title is always redacted. */}
            <h3 className="text-[15px] font-semibold leading-snug text-ink group-hover:text-brand">
              {redactLocationDetails(listing.title)}
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

          {reason && (
            <p className="mt-3 flex gap-2 rounded-lg bg-brand-soft/70 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">
              <svg
                viewBox="0 0 16 16"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0.5l1.9 4.3 4.6.5-3.4 3.1 1 4.6L8 10.7l-4.1 2.3 1-4.6L1.5 5.3l4.6-.5L8 .5Z" />
              </svg>
              <span>{reason}</span>
            </p>
          )}

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
      </div>
    </Link>
  );
}
