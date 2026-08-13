import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteListingButton } from "@/components/delete-listing-button";
import { EditListingForm } from "@/components/edit-listing-form";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { countThreadsByListing } from "@/lib/conversations";
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
  // So the delete confirmation can say how many conversations it takes with it.
  const threads =
    (await countThreadsByListing([listing.id], user.id)).get(listing.id) ?? 0;

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
          <path
            d="M10 3 5 8l5 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
        initialImages={listing.images}
        values={{
          title: listing.title,
          description: listing.description,
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

      <section className="card mt-5 border-brand-line p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          Delete listing
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Erases the room, its photos and{" "}
          {threads === 0
            ? "any conversation about it"
            : threads === 1
              ? "the 1 conversation about it"
              : `all ${threads} conversations about it`}
          . Deactivating is almost always the better move - deleting is for a
          listing posted by mistake.
        </p>
        <div className="mt-4">
          <DeleteListingButton
            listingId={listing.id}
            title={listing.title}
            photoCount={listing.images.length}
            threadCount={threads}
            isActive={active}
          />
        </div>
      </section>
    </div>
  );
}
