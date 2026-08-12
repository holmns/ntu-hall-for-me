import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EditListingForm } from "@/components/edit-listing-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { hasImageStorage } from "@/lib/storage";
import { LISTING_IMAGE_SELECT } from "@/lib/images";
import type { ListingTag } from "@/generated/prisma/enums";
import { setListingStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditListingPage(
  props: PageProps<"/listings/[id]/edit">,
) {
  const { id } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect(`/signin?callbackUrl=/listings/${id}/edit`);

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: LISTING_IMAGE_SELECT },
  });

  // A listing that is not yours should not even be confirmed to exist.
  if (!listing || listing.providerId !== user.id) notFound();

  const active = listing.status === "ACTIVE";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/listings/${listing.id}`}
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
        Back to listing
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
        Edit listing
      </h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
        Changes go live immediately. Anyone already in a chat with you keeps
        their thread.
      </p>

      <EditListingForm
        listingId={listing.id}
        imagesEnabled={hasImageStorage()}
        initialImages={listing.images}
        values={{
          title: listing.title,
          description: listing.description,
          category: listing.category,
          roomType: listing.roomType,
          price: listing.price,
          tags: listing.tags as ListingTag[],
          address: listing.address,
          lat: listing.lat,
          lng: listing.lng,
        }}
      />

      <section className="card mt-5 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          Visibility
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          {active
            ? "This listing appears in search. Deactivate it once the room is taken - it stays in your listings and your existing chats keep working."
            : "This listing is hidden from search. Nobody can find it, and its page is only visible to you."}
        </p>
        <form action={setListingStatus} className="mt-4">
          <input type="hidden" name="listingId" value={listing.id} />
          <input
            type="hidden"
            name="status"
            value={active ? "INACTIVE" : "ACTIVE"}
          />
          <button type="submit" className="btn-secondary">
            {active ? "Deactivate listing" : "Reactivate listing"}
          </button>
        </form>
      </section>
    </div>
  );
}
