import Link from "next/link";
import { redirect } from "next/navigation";

import { ListingCard } from "@/components/listing-card";
import { SaveButton } from "@/components/save-button";
import { getCurrentUser } from "@/lib/auth";
import { listSavedListings } from "@/lib/saved";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/saved");

  const saved = await listSavedListings(user.id);
  const live = saved.filter(({ listing }) => listing.status === "ACTIVE").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Saved rooms
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-soft">
            {saved.length === 0
              ? "Nothing saved yet."
              : `${saved.length} saved, ${live} still available.`}
          </p>
        </div>
        <Link href="/search" className="btn-secondary shrink-0">
          Browse rooms
        </Link>
      </div>

      {saved.length === 0 ? (
        <div className="card mt-6 px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-ink">
            Your shortlist is empty
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Tap the heart on any room to keep it here. Saving is private - the
            provider is not told.
          </p>
          <Link href="/search" className="btn-primary mt-6">
            Find a room
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {saved.map(({ listing }) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              unavailable={listing.status !== "ACTIVE"}
              save={
                <SaveButton
                  listingId={listing.id}
                  saved
                  signedIn
                  // This page IS the shortlist, so removing one has to take the
                  // card with it rather than leave a hollow entry behind.
                  refreshAfter
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
