"use client";

import { ListingForm } from "./listing-form";
import { createListing } from "@/app/post/actions";

export function PostListingForm() {
  return (
    <ListingForm
      action={createListing}
      submitLabel="Publish listing"
      pendingLabel="Publishing..."
      footerNote="You can edit or deactivate it later from your listings."
    />
  );
}
