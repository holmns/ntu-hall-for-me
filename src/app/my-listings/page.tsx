import Link from "next/link";
import { redirect } from "next/navigation";

import { DeleteListingButton } from "@/components/delete-listing-button";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { countThreadsByListing } from "@/lib/conversations";
import { LISTING_IMAGE_SELECT } from "@/lib/images";
import { CATEGORY_LABELS, ROOM_TYPE_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/my-listings");

  const listings = await prisma.listing.findMany({
    where: { providerId: user.id },
    include: { images: LISTING_IMAGE_SELECT },
    orderBy: { createdAt: "desc" },
  });

  const active = listings.filter((l) => l.status === "ACTIVE").length;
  // One grouped query for the whole page, so the delete confirmation on each
  // row can name the conversations that row would take with it.
  const threads = await countThreadsByListing(
    listings.map((l) => l.id),
    user.id,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Your listings
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {listings.length === 0
              ? "Nothing posted yet."
              : `${listings.length} posted, ${active} showing in search.`}
          </p>
        </div>
        <Link href="/post" className="btn-primary shrink-0">
          Post a room
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="card mt-6 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">No listings yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Post a room and seekers will find it by describing what they want in
            plain English.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {listings.map((listing) => {
            const cover = listing.images[0];
            const isActive = listing.status === "ACTIVE";

            return (
              <li key={listing.id} className="card p-4">
                <div className="flex items-start gap-3.5">
                  <div className="h-[72px] w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted sm:h-[84px] sm:w-28">
                    {cover ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={cover.url}
                        alt={cover.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-6 w-6 text-line-strong"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="8.5" cy="10" r="1.5" />
                          <path
                            d="m4 17 4.5-4.5L12 16l3-3 5 5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      {/* The owner's own listing, so nothing is redacted. */}
                      <h2 className="text-[15px] font-semibold leading-snug text-ink">
                        {listing.title}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          isActive
                            ? "bg-accent-soft text-accent"
                            : "bg-surface-muted text-ink-faint"
                        }`}
                      >
                        {isActive ? "Live" : "Hidden"}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
                      <span className="font-medium tabular-nums text-ink">
                        ${listing.price.toLocaleString()}
                      </span>
                      <span className="text-line-strong">/</span>
                      <span>{ROOM_TYPE_LABELS[listing.roomType]}</span>
                      <span className="text-line-strong">/</span>
                      <span>{CATEGORY_LABELS[listing.category]}</span>
                      <span className="text-line-strong">/</span>
                      <span>
                        {listing.images.length}{" "}
                        {listing.images.length === 1 ? "photo" : "photos"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/listings/${listing.id}/edit`}
                        className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/listings/${listing.id}`}
                        className="rounded-lg px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                      >
                        View
                      </Link>
                      <DeleteListingButton
                        listingId={listing.id}
                        title={listing.title}
                        photoCount={listing.images.length}
                        threadCount={threads.get(listing.id) ?? 0}
                        isActive={isActive}
                        variant="quiet"
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
