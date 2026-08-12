"use client";

import { ListingForm } from "./listing-form";
import { createListing } from "@/app/post/actions";

export function PostListingForm({
  imagesEnabled = true,
}: {
  imagesEnabled?: boolean;
}) {
  return (
    <ListingForm
      action={createListing}
      imagesEnabled={imagesEnabled}
      submitLabel="Publish listing"
      pendingLabel="Publishing..."
      footerNote="You can edit or deactivate it later from your listings."
    />
  );
}
