import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGES_PER_LISTING,
  sniffImageType,
  type AcceptedImageType,
} from "./images";
import {
  removeListingImages,
  uploadListingImage,
  type StoredImage,
} from "./storage";

/**
 * Reading listing photos out of a submitted form, shared by `createListing`
 * and `updateListing`.
 *
 * Both actions are reachable by direct POST, so nothing the client claims
 * about a file is taken at face value here: the size is re-checked and the
 * type comes from the magic bytes rather than the browser's Content-Type.
 */

export type PendingImage = {
  bytes: Uint8Array;
  mimeType: AcceptedImageType;
  width: number;
  height: number;
};

/** A photo the provider sent that we are refusing, with a reason to show. */
export class ImageInputError extends Error {}

/**
 * Client-reported dimensions are a layout hint, not a security boundary, so
 * they are clamped rather than trusted or rejected.
 */
function dimension(value: FormDataEntryValue | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_IMAGE_EDGE;
  return Math.min(Math.round(parsed), MAX_IMAGE_EDGE);
}

/**
 * The newly picked files in a submission, in slot order.
 *
 * `total` is how many photos the listing will end up with once kept ones are
 * counted, so the per-listing cap can be enforced across both kinds.
 */
export async function readNewImages(
  formData: FormData,
  total: number,
): Promise<PendingImage[]> {
  // An empty file input still submits one zero-byte entry.
  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return [];

  // Never let a missing or short slot list wave the cap through.
  if (Math.max(total, files.length) > MAX_IMAGES_PER_LISTING) {
    throw new ImageInputError(
      `Up to ${MAX_IMAGES_PER_LISTING} photos per listing.`,
    );
  }

  const widths = formData.getAll("imageWidth");
  const heights = formData.getAll("imageHeight");

  const pending: PendingImage[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ImageInputError(
        `Each photo must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffImageType(bytes);
    if (!mimeType) {
      throw new ImageInputError(
        "One of those files is not a JPG, PNG or WebP image.",
      );
    }
    pending.push({
      bytes,
      mimeType,
      width: dimension(widths[index]),
      height: dimension(heights[index]),
    });
  }

  return pending;
}

/**
 * Uploads every pending photo, or none of them.
 *
 * Settled rather than raced: when one upload fails we still need the paths of
 * the ones that succeeded so they can be swept up before the caller rolls the
 * rest of its work back.
 */
export async function uploadPendingImages(
  listingId: string,
  pending: PendingImage[],
): Promise<StoredImage[]> {
  if (pending.length === 0) return [];

  const results = await Promise.allSettled(
    pending.map((image) =>
      uploadListingImage(listingId, image.bytes, image.mimeType),
    ),
  );

  const uploaded = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (uploaded.length !== pending.length) {
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[listing-photos] upload failed:", result.reason);
      }
    }
    await removeListingImages(uploaded.map((file) => file.storagePath));
    throw new Error("One or more photo uploads failed");
  }

  return uploaded;
}
