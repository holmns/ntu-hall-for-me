"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  approximateLocation,
  computeCommute,
  getPlaceDetail,
  haversineMeters,
} from "@/lib/maps";
import { uploadedImageAlt } from "@/lib/images";
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

  // The single Maps write-path call. Results are cached on the row and search
  // never recomputes them.
  const commute = await computeCommute(point, data.category);
  const approx = approximateLocation(point, `${user.id}:${address}`);

  const listing = await prisma.listing.create({
    data: {
      providerId: user.id,
      title: data.title,
      description: data.description,
      category: data.category,
      price: data.price,
      roomType: data.roomType,
      tags: data.tags as never,
      address,
      lat: point.lat,
      lng: point.lng,
      approxLat: approx.lat,
      approxLng: approx.lng,
      distanceMeters: commute.distanceMeters,
      distanceWalkingMin: commute.walkingMin,
      distanceTransitMin: commute.transitMin,
      distanceDrivingMin: commute.drivingMin,
    },
    select: { id: true },
  });

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
