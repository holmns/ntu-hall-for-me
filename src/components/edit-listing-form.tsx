"use client";

import Link from "next/link";

import { ListingForm, type ListingFormValues } from "./listing-form";
import { updateListing } from "@/app/listings/[id]/edit/actions";
import type { ListingImageView } from "@/lib/images";

export function EditListingForm({
  listingId,
  values,
  initialImages,
}: {
  listingId: string;
  values: ListingFormValues;
  initialImages: ListingImageView[];
}) {
  return (
    <ListingForm
      action={updateListing}
      // Which listing this is editing. The action re-checks that the
      // signed-in user owns it, so this is a lookup key, not a permission.
      hidden={{ listingId }}
      values={values}
      initialImages={initialImages}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      secondary={
        <Link href={`/listings/${listingId}`} className="btn-secondary">
          Cancel
        </Link>
      }
    />
  );
}
