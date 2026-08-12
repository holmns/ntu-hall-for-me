import Link from "next/link";
import { notFound } from "next/navigation";

import { ApproxMap } from "@/components/approx-map";
import { TagPill } from "@/components/listing-card";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAddressUnlocked } from "@/lib/conversations";
import { redactLocationDetails } from "@/lib/redaction";
import {
  CATEGORY_LABELS,
  ON_CAMPUS_DISCLAIMER,
  ROOM_TYPE_LABELS,
} from "@/lib/constants";
import type { ListingTag } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ListingPage(props: PageProps<"/listings/[id]">) {
  const { id } = await props.params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { provider: { select: { id: true, name: true, image: true } } },
  });
  if (!listing) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === listing.providerId;
  const addressUnlocked = user
    ? await isAddressUnlocked(listing.id, user.id, listing.providerId)
    : false;

  // The map pin is useless as protection if the free text spells out the
  // block or unit, so the same gate applies to the listing's own words.
  const title = addressUnlocked
    ? listing.title
    : redactLocationDetails(listing.title);
  const description = addressUnlocked
    ? listing.description
    : redactLocationDetails(listing.description);

  const tags = listing.tags as ListingTag[];
  const onCampus = listing.category === "ON_CAMPUS";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to search
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------------------------------------------------------- */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
              {CATEGORY_LABELS[listing.category]}
            </span>
            <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
              {ROOM_TYPE_LABELS[listing.roomType]}
            </span>
          </div>

          <h1 className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
            {title}
          </h1>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-ink">
              ${listing.price.toLocaleString()}
            </span>
            <span className="text-[13px] text-ink-soft">per month</span>
          </div>

          {onCampus && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
              {ON_CAMPUS_DISCLAIMER}
            </p>
          )}

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Description
            </h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">
              {description}
            </p>
          </section>

          {tags.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                What this place has
              </h2>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Location
            </h2>

            <div className="mt-2.5">
              <ApproxMap
                lat={addressUnlocked ? listing.lat : listing.approxLat}
                lng={addressUnlocked ? listing.lng : listing.approxLng}
                exact={addressUnlocked}
              />
            </div>

            {addressUnlocked ? (
              <p className="mt-2.5 flex items-start gap-2 text-[14px] text-ink">
                <svg
                  viewBox="0 0 16 16"
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 0a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                </svg>
                {listing.address}
              </p>
            ) : (
              <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                <svg
                  viewBox="0 0 16 16"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4.5 6V4.5a3.5 3.5 0 1 1 7 0V6H12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h.5Zm1.5 0h4V4.5a2 2 0 1 0-4 0V6Z" />
                </svg>
                Approximate area only. The exact address is shared once the
                provider replies to you, so it is their choice to share it.
              </p>
            )}
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Commute to NTU
            </h2>
            {onCampus ? (
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-soft">
                Already on campus, so there is no commute to measure.
              </p>
            ) : (
              <dl className="mt-2.5 space-y-2">
                <CommuteRow label="Walk" minutes={listing.distanceWalkingMin} />
                <CommuteRow
                  label="Bus / MRT"
                  minutes={listing.distanceTransitMin}
                />
                <CommuteRow label="Drive" minutes={listing.distanceDrivingMin} />
                <div className="flex items-center justify-between border-t border-line pt-2 text-[13px]">
                  <dt className="text-ink-faint">Distance</dt>
                  <dd className="tabular-nums text-ink-soft">
                    {(listing.distanceMeters / 1000).toFixed(1)} km
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="card mt-3 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Posted by
            </h2>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                {(listing.provider.name ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-ink">
                  {listing.provider.name ?? "A provider"}
                </span>
                <span className="block text-xs text-ink-faint">
                  Listed{" "}
                  {listing.createdAt.toLocaleDateString("en-SG", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>
            </div>

            <div className="mt-4">
              {isOwner ? (
                <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-[13px] text-ink-soft">
                  This is your listing.
                </p>
              ) : user ? (
                <Link
                  href={`/messages/${listing.id}/${listing.providerId}`}
                  className="btn-primary w-full"
                >
                  Message provider
                </Link>
              ) : (
                <Link
                  href={`/signin?callbackUrl=/listings/${listing.id}`}
                  className="btn-primary w-full"
                >
                  Sign in to message
                </Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CommuteRow({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="tabular-nums text-ink">{minutes} min</dd>
    </div>
  );
}
