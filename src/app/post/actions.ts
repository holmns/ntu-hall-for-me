"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { computeCommute, getPlaceDetail, haversineMeters } from "@/lib/maps";
import { campusCategory } from "@/lib/campus";
import { uploadedImageAlt } from "@/lib/images";
import { embedAndStoreListing } from "@/lib/embeddings";
import type { ListingTag } from "@/generated/prisma/enums";
import {
  fieldErrorsFrom,
  MAX_ADJUST_M,
  parseListingForm,
  type ListingFormState,
} from "@/lib/listing-input";
import {
  ImageInputError,
  readNewImages,
  uploadPendingImages,
  type PendingImage,
} from "@/lib/listing-photos";

/** Kept as its own name because the post form imports it. */
export type PostListingState = ListingFormState;

export async function createListing(
  _prev: PostListingState,
  formData: FormData,
): Promise<PostListingState> {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/signin?callbackUrl=/post");
  }

  const parsed = parseListingForm(formData);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  // Before the Maps call, so a rejected photo does not cost a Distance Matrix
  // request.
  let pendingImages: PendingImage[];
  try {
    const count = formData.getAll("imageSlot").length;
    pendingImages = await readNewImages(formData, count);
  } catch (cause) {
    if (cause instanceof ImageInputError) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { images: cause.message },
      };
    }
    throw cause;
  }

  const data = parsed.data;

  // Re-resolve the place server-side so the stored coordinates cannot be
  // spoofed by editing hidden form fields. The provider may still fine-tune
  // the pin (Places returns a building, not the right block), but only within
  // MAX_ADJUST_M of the address the place actually resolves to.
  let point = { lat: data.lat, lng: data.lng };
  let address = data.address;
  if (data.placeId) {
    const detail = await getPlaceDetail(data.placeId);
    if (detail) {
      const anchor = { lat: detail.lat, lng: detail.lng };
      address = detail.address || address;
      const drift = haversineMeters(anchor, point);
      point = data.pinAdjusted && drift <= MAX_ADJUST_M ? point : anchor;
    }
  }

  // Where the room is, not what anyone picked. The form has no category
  // field; it reads the address the same way and says which one it is.
  const category = campusCategory(point);

  // The single Maps write-path call. Results are cached on the row and search
  // never recomputes them.
  const commute = await computeCommute(point, category);

  const listing = await prisma.listing.create({
    data: {
      providerId: user.id,
      title: data.title,
      description: data.description,
      category,
      price: data.price,
      roomType: data.roomType,
      // Undefined where the provider left the field blank, which Prisma stores
      // as NULL - the listing page reads that as "not stated" and says so.
      availableFrom: data.availableFrom,
      minTermMonths: data.minTermMonths,
      maxTermMonths: data.maxTermMonths,
      deposit: data.deposit,
      housemates: data.housemates,
      tags: data.tags as never,
      address,
      lat: point.lat,
      lng: point.lng,
      distanceMeters: commute.distanceMeters,
      distanceWalkingMin: commute.walkingMin,
      distanceTransitMin: commute.transitMin,
      distanceDrivingMin: commute.drivingMin,
    },
    select: { id: true },
  });

  // Search orders by this vector, so a listing without one is buried below
  // every embedded listing no matter how well it fits. That is a silent
  // failure the provider would never see, so it is rolled back like a failed
  // photo upload rather than published in a degraded state.
  try {
    await embedAndStoreListing(listing.id, {
      title: data.title,
      description: data.description,
      category,
      roomType: data.roomType,
      price: data.price,
      tags: data.tags as ListingTag[],
    });
  } catch (cause) {
    console.error("[post] embedding failed, rolling back listing:", cause);
    await prisma.listing.delete({ where: { id: listing.id } });
    return {
      error:
        "Your listing could not be indexed for search, so it was not published. Please try again.",
    };
  }

  if (pendingImages.length > 0) {
    let uploaded;
    try {
      uploaded = await uploadPendingImages(listing.id, pendingImages);
    } catch {
      // Publishing a listing whose photos silently vanished is worse than not
      // publishing it, so undo the whole thing and let the provider retry.
      await prisma.listing.delete({ where: { id: listing.id } });
      return {
        error:
          "Your photos could not be uploaded, so the listing was not published. Please try again.",
      };
    }

    await prisma.listingImage.createMany({
      data: pendingImages.map((image, index) => ({
        listingId: listing.id,
        url: uploaded[index].url,
        storagePath: uploaded[index].storagePath,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        alt: uploadedImageAlt(index),
        position: index,
      })),
    });
  }

  // Providers who only ever sought before are now both.
  await prisma.user.update({
    where: { id: user.id },
    data: { role: user.role === "SEEKER" ? "BOTH" : user.role },
  });

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/my-listings");
  redirect(`/listings/${listing.id}`);
}
