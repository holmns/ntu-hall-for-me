import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ListingMap } from "@/components/listing-map";
import { ListingGallery } from "@/components/listing-gallery";
import { ListingCard, TagPill } from "@/components/listing-card";
import { findSimilarListings } from "@/lib/matching";
import { SaveButton } from "@/components/save-button";
import { prisma } from "@/lib/prisma";
import { LISTING_IMAGE_SELECT } from "@/lib/images";
import { getCurrentUser } from "@/lib/auth";
import { isSaved } from "@/lib/saved";
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
    include: {
      provider: {
        select: {
          id: true,
          name: true,
          image: true,
          // For the trust line below. A seeker is being asked to turn up at a
          // stranger's flat, and this is the only thing on the page that says
          // anything about the stranger.
          createdAt: true,
          _count: { select: { listings: { where: { status: "ACTIVE" } } } },
        },
      },
      images: LISTING_IMAGE_SELECT,
    },
  });
  if (!listing) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === listing.providerId;

  // A withdrawn room should stop taking enquiries, but a bookmarked link
  // deserves a better answer than a bare 404.
  if (listing.status !== "ACTIVE" && !isOwner) return <Withdrawn />;

  const saved = await isSaved(user?.id, listing.id);
  const tags = listing.tags as ListingTag[];
  const onCampus = listing.category === "ON_CAMPUS";

  return (
    // max-w-4xl minus a 320px sidebar left the gallery about 520px wide on
    // every monitor, which is a thumbnail of a room, not a look at one.
    //
    // `data-sticky-cta` is what globals.css keys the footer's bottom padding
    // off, so the pinned bar below does not sit on top of it.
    <div data-sticky-cta className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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

      {isOwner && listing.status !== "ACTIVE" && (
        <p className="mt-4 rounded-xl border border-line bg-surface-muted px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">This listing is hidden.</span>{" "}
          It does not appear in search and only you can open this page.
          Reactivate it from{" "}
          <Link
            href={`/listings/${listing.id}/edit`}
            className="font-medium text-brand hover:underline"
          >
            edit
          </Link>
          .
        </p>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        {/* ---------------------------------------------------------------- */}
        <div>
          {listing.images.length > 0 && (
            <div className="mb-5">
              <ListingGallery images={listing.images} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
              {CATEGORY_LABELS[listing.category]}
            </span>
            <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-soft">
              {ROOM_TYPE_LABELS[listing.roomType]}
            </span>
          </div>

          <h1 className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">
            {listing.title}
          </h1>

          {/* The price lives in the sticky card from lg up, where it leads the
              thing you act on. Below lg the sidebar stacks underneath the map,
              which is far too late to first mention what the room costs - so
              at phone and tablet widths it stays here, under the title. */}
          <div className="mt-2 flex items-baseline gap-2 lg:hidden">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
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
              {listing.description}
            </p>
          </section>

          {/* Always rendered, even when the provider filled none of it in.
              A seeker who cannot see whether a room is free in August will ask
              in the first message either way; a row that says "Ask the
              provider" at least tells them the question is worth asking, and
              tells the provider what their listing is missing. */}
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Terms
            </h2>
            <dl className="mt-2.5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              <TermRow
                label="Available from"
                value={
                  listing.availableFrom
                    ? listing.availableFrom.toLocaleDateString("en-SG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })
                    : null
                }
              />
              <TermRow label="Stay" value={termLength(listing)} />
              <TermRow
                label="Deposit"
                value={
                  listing.deposit == null
                    ? null
                    : listing.deposit === 0
                      ? "None"
                      : `$${listing.deposit.toLocaleString()}`
                }
              />
              <TermRow
                label="Other housemates"
                value={
                  listing.housemates == null
                    ? null
                    : listing.housemates === 0
                      ? "None, you would have it to yourself"
                      : String(listing.housemates)
                }
              />
            </dl>
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
              <ListingMap lat={listing.lat} lng={listing.lng} />
            </div>

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

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
            >
              Open in Google Maps
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M6 3H3.5a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1H12a1 1 0 0 0 1-1V10M9 3h4v4M13 3 7 9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* The action card leads, with the price at the top of it: what the
            room costs and how to ask about it are one decision, and they were
            split across two columns with the price set smaller than the title
            above it. The commute follows, since it is a fact about the room
            rather than something to act on. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <div className="hidden items-baseline gap-2 border-b border-line pb-4 lg:flex">
              <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-ink">
                ${listing.price.toLocaleString()}
              </span>
              <span className="text-[13px] text-ink-soft">per month</span>
            </div>

            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint lg:mt-4">
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

            {/* Two facts the app already knows, stated plainly. Deliberately
                not dressed up as verification: nothing here has been checked,
                and a badge implying otherwise would be worse than saying
                nothing at all. */}
            <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">On Room Finder since</dt>
                <dd className="text-ink-soft">
                  {listing.provider.createdAt.toLocaleDateString("en-SG", {
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">Rooms listed</dt>
                <dd className="tabular-nums text-ink-soft">
                  {listing.provider._count.listings}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              {isOwner ? (
                <div className="space-y-2">
                  <Link
                    href={`/listings/${listing.id}/edit`}
                    className="btn-primary w-full"
                  >
                    Edit listing
                  </Link>
                  <Link
                    href="/my-listings"
                    className="btn-secondary w-full !font-normal"
                  >
                    All your listings
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {user ? (
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
                  <SaveButton
                    listingId={listing.id}
                    saved={saved}
                    signedIn={user != null}
                    variant="labelled"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card mt-3 p-5">
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
        </aside>
      </div>

      {/* The page used to end at the location map with a good third of the
          viewport empty and no next step but the back button. Every listing
          page in the category has a continuation rail, and here it is unusually
          cheap: one vector comparison against a row that is already stored. */}
      <Suspense fallback={null}>
        <SimilarRooms listingId={listing.id} />
      </Suspense>

      {/* Below lg the sidebar stacks under the location map, so the only way
          to act on a room you have just finished reading about was to scroll
          back up past the whole page. Pinned, it is the highest-converting
          pattern in the category and every phone-sized competitor has it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold leading-tight tabular-nums text-ink">
              ${listing.price.toLocaleString()}
            </div>
            <div className="text-[11px] text-ink-faint">per month</div>
          </div>
          <div className="ml-auto shrink-0">
            {isOwner ? (
              <Link
                href={`/listings/${listing.id}/edit`}
                className="btn-primary"
              >
                Edit listing
              </Link>
            ) : user ? (
              <Link
                href={`/messages/${listing.id}/${listing.providerId}`}
                className="btn-primary"
              >
                Message provider
              </Link>
            ) : (
              <Link
                href={`/signin?callbackUrl=/listings/${listing.id}`}
                className="btn-primary"
              >
                Sign in to message
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Clears the page's own last element. The site footer is handled
          separately in globals.css - it lives outside this container. */}
      <div aria-hidden="true" className="h-4 lg:hidden" />
    </div>
  );
}

/**
 * Streamed in its own boundary so the room itself is never waiting on it: the
 * reader came for this listing, and the rail is what they read afterwards.
 */
async function SimilarRooms({ listingId }: { listingId: string }) {
  const similar = await findSimilarListings(listingId);
  if (similar.length === 0) return null;

  return (
    <section className="mt-10 border-t border-line pt-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Rooms like this one
      </h2>
      <p className="mt-1 text-[13px] text-ink-soft">
        Closest matches by description, not by price or distance.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {similar.map((room) => (
          <ListingCard key={room.id} listing={room} layout="stacked" />
        ))}
      </div>
    </section>
  );
}

/** One term, or an honest admission that the listing does not say. */
function TermRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0 sm:last:border-b">
      <dt className="shrink-0 text-[13px] text-ink-faint">{label}</dt>
      <dd
        className={`text-right text-[14px] ${
          value ? "text-ink" : "italic text-ink-faint"
        }`}
      >
        {value ?? "Ask the provider"}
      </dd>
    </div>
  );
}

/** "6 to 12 months", "At least 6 months", "Up to 12 months", or nothing. */
function termLength(listing: {
  minTermMonths: number | null;
  maxTermMonths: number | null;
}): string | null {
  const { minTermMonths: min, maxTermMonths: max } = listing;
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

  if (min != null && max != null) {
    return min === max ? months(min) : `${min} to ${months(max)}`;
  }
  if (min != null) return `At least ${months(min)}`;
  if (max != null) return `Up to ${months(max)}`;
  return null;
}

/**
 * Shown instead of a deactivated listing. Deliberately reveals nothing about
 * the room, but says plainly what happened so a saved link is not a dead end.
 */
function Withdrawn() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        This room is no longer listed
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        The provider has taken it down, usually because the room is taken.
      </p>
      <Link href="/search" className="btn-primary mt-6">
        Browse other rooms
      </Link>
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
