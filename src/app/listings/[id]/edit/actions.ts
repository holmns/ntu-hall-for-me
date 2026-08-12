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
import { MAX_IMAGES_PER_LISTING, uploadedImageAlt } from "@/lib/images";
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
} from "@/lib/listing-photos";
import { removeListingImages, type StoredImage } from "@/lib/storage";
import {
  EMBEDDING_MODEL,
  embedText,
  listingEmbeddingText,
  toVectorLiteral,
} from "@/lib/embeddings";
import type { ListingTag } from "@/generated/prisma/enums";

function imagesError(message: string): ListingFormState {
  return {
    error: "Please fix the highlighted fields.",
    fieldErrors: { images: message },
  };
}

function revalidateListing(id: string) {
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath("/my-listings");
  revalidatePath(`/listings/${id}`);
}

export async function updateListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return { error: "Something went wrong. Please reload." };

  let user;
  try {
    user = await requireUser();
  } catch {
    redirect(`/signin?callbackUrl=/listings/${listingId}/edit`);
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      providerId: true,
      address: true,
      lat: true,
      lng: true,
      category: true,
      // Needed to tell whether the embedded text actually changed.
      title: true,
      description: true,
      roomType: true,
      price: true,
      tags: true,
      distanceMeters: true,
      distanceWalkingMin: true,
      distanceTransitMin: true,
      distanceDrivingMin: true,
      images: {
        select: { id: true, storagePath: true },
        orderBy: { position: "asc" },
      },
    },
  });

  // Reachable by direct POST, so ownership is re-checked here and not merely
  // in the page that renders the form.
  if (!listing || listing.providerId !== user.id) {
    return { error: "That listing is not yours to edit." };
  }

  const parsed = parseListingForm(formData);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const data = parsed.data;

  // -------------------------------------------------------------------------
  // Photos: one ordered slot list expresses keep, drop, reorder and add.
  // -------------------------------------------------------------------------
  const slots = formData.getAll("imageSlot").map(String);
  if (slots.length > MAX_IMAGES_PER_LISTING) {
    return imagesError(`Up to ${MAX_IMAGES_PER_LISTING} photos per listing.`);
  }

  const keepIds = slots
    .filter((slot) => slot.startsWith("keep:"))
    .map((slot) => slot.slice("keep:".length));
  const ownIds = new Set(listing.images.map((image) => image.id));
  if (keepIds.some((id) => !ownIds.has(id))) {
    return imagesError(
      "Those photos are out of date. Reload the page and try again.",
    );
  }

  let pending;
  try {
    pending = await readNewImages(formData, slots.length);
  } catch (cause) {
    if (cause instanceof ImageInputError) return imagesError(cause.message);
    throw cause;
  }

  // A slot list that disagrees with the files attached means the form and the
  // request drifted apart; guessing which is right would reorder the gallery.
  if (slots.filter((slot) => slot === "new").length !== pending.length) {
    return imagesError("Photo upload was interrupted. Please try again.");
  }

  // -------------------------------------------------------------------------
  // Location. `placeId` is only set when a new address was picked from the
  // suggestions, so its absence means "address untouched".
  // -------------------------------------------------------------------------
  const stored = { lat: listing.lat, lng: listing.lng };
  let point = stored;
  let address = listing.address;

  if (data.placeId) {
    const detail = await getPlaceDetail(data.placeId);
    if (detail) {
      const anchor = { lat: detail.lat, lng: detail.lng };
      address = detail.address || data.address;
      const candidate = { lat: data.lat, lng: data.lng };
      const drift = haversineMeters(anchor, candidate);
      point = data.pinAdjusted && drift <= MAX_ADJUST_M ? candidate : anchor;
    }
    // A failed lookup keeps the stored location rather than trusting the raw
    // coordinates in the form.
  } else if (data.pinAdjusted) {
    // Pin nudged without changing the address. Bound it against the stored
    // point, otherwise editing would be a way around the create-time check.
    const candidate = { lat: data.lat, lng: data.lng };
    if (haversineMeters(stored, candidate) <= MAX_ADJUST_M) point = candidate;
  }

  const moved = point.lat !== stored.lat || point.lng !== stored.lng;
  const categoryChanged = data.category !== listing.category;

  // Distance Matrix is the one paid call in this action, and on-campus
  // listings store zeroes, so only ask when the answer can actually differ.
  const commute =
    moved || categoryChanged
      ? await computeCommute(point, data.category)
      : {
          distanceMeters: listing.distanceMeters,
          walkingMin: listing.distanceWalkingMin,
          transitMin: listing.distanceTransitMin,
          drivingMin: listing.distanceDrivingMin,
        };

  // Deterministic in the point and address, so this is a no-op when neither
  // changed.
  const approx = approximateLocation(point, `${user.id}:${address}`);

  // Same guard as the commute above: re-embedding is a paid round trip, so
  // compare the text that actually gets embedded rather than assuming any save
  // changed it. Moving the pin does not, since location is deliberately not
  // part of the vector.
  const nextEmbeddingText = listingEmbeddingText({
    title: data.title,
    description: data.description,
    category: data.category,
    roomType: data.roomType,
    price: data.price,
    tags: data.tags as ListingTag[],
  });
  const textChanged =
    nextEmbeddingText !==
    listingEmbeddingText({
      title: listing.title,
      description: listing.description,
      category: listing.category,
      roomType: listing.roomType,
      price: listing.price,
      tags: listing.tags as ListingTag[],
    });

  // Before the transaction, so a failed embedding leaves the listing untouched
  // rather than saved with a vector describing the previous wording.
  let embedding: number[] | null = null;
  if (textChanged) {
    try {
      embedding = await embedText(nextEmbeddingText);
    } catch (cause) {
      console.error("[edit] embedding failed, nothing was changed:", cause);
      return {
        error:
          "Your changes could not be indexed for search, so nothing was saved. Please try again.",
      };
    }
  }

  // -------------------------------------------------------------------------
  // Write. Uploads happen first: a failed upload must not leave the listing
  // half-edited.
  // -------------------------------------------------------------------------
  let uploaded: StoredImage[] = [];
  if (pending.length > 0) {
    try {
      uploaded = await uploadPendingImages(listing.id, pending);
    } catch {
      return {
        error:
          "Your new photos could not be uploaded, so nothing was changed. Please try again.",
      };
    }
  }

  const dropped = listing.images.filter((image) => !keepIds.includes(image.id));

  let cursor = 0;
  const photoWrites = slots.map((slot, position) => {
    if (slot !== "new") {
      return prisma.listingImage.update({
        where: { id: slot.slice("keep:".length) },
        data: { position },
      });
    }
    const image = pending[cursor];
    const file = uploaded[cursor];
    cursor += 1;
    return prisma.listingImage.create({
      data: {
        listingId: listing.id,
        url: file.url,
        storagePath: file.storagePath,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        alt: uploadedImageAlt(position),
        position,
      },
    });
  });

  // A batch transaction rather than an interactive one: this runs against the
  // Supabase pooler in transaction mode, where interactive transactions are
  // unreliable.
  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listing.id },
      data: {
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
    }),
    // Raw because `embedding` is an Unsupported column. It rides in the same
    // batch so the row and its vector can never disagree.
    ...(embedding
      ? [
          prisma.$executeRaw`
            UPDATE "Listing"
            SET "embedding" = ${toVectorLiteral(embedding)}::vector,
                "embeddingModel" = ${EMBEDDING_MODEL},
                "embeddedAt" = NOW()
            WHERE "id" = ${listing.id}
          `,
        ]
      : []),
    ...(dropped.length > 0
      ? [
          prisma.listingImage.deleteMany({
            where: { id: { in: dropped.map((image) => image.id) } },
          }),
        ]
      : []),
    ...photoWrites,
  ]);

  // Only once the rows are gone, so a failed transaction cannot leave the
  // gallery pointing at objects that no longer exist.
  await removeListingImages(
    dropped
      .map((image) => image.storagePath)
      .filter((path): path is string => Boolean(path)),
  );

  revalidateListing(listing.id);
  redirect(`/listings/${listing.id}`);
}

/**
 * Takes a listing out of search, or puts it back. Deactivating is the way to
 * withdraw a room: there is no hard delete, so existing chat threads keep
 * working.
 */
export async function setListingStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "INACTIVE";

  // providerId in the filter is the ownership check: someone else's id simply
  // matches nothing.
  const { count } = await prisma.listing.updateMany({
    where: { id: listingId, providerId: user.id },
    data: { status },
  });
  if (count === 0) return;

  revalidateListing(listingId);
}
