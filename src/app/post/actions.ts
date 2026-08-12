"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import {
  approximateLocation,
  computeCommute,
  getPlaceDetail,
  haversineMeters,
} from "@/lib/maps";
import { ALL_TAGS, PRICE_MAX, PRICE_MIN } from "@/lib/constants";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGES_PER_LISTING,
  sniffImageType,
  uploadedImageAlt,
  type AcceptedImageType,
} from "@/lib/images";
import {
  hasImageStorage,
  removeListingImages,
  uploadListingImage,
  type StoredImage,
} from "@/lib/storage";

const schema = z.object({
  title: z.string().trim().min(6, "Give the listing a clearer title").max(120),
  description: z
    .string()
    .trim()
    .min(30, "Write at least a couple of sentences so matching has something to work with")
    .max(4000),
  category: z.enum(["ON_CAMPUS", "OFF_CAMPUS"]),
  price: z.coerce
    .number()
    .int()
    .min(PRICE_MIN, "Price cannot be negative")
    .max(PRICE_MAX, `Price looks too high (max $${PRICE_MAX})`),
  roomType: z.enum(["SINGLE", "SHARED", "WHOLE_UNIT"]),
  tags: z.array(z.enum(ALL_TAGS as [string, ...string[]])).default([]),
  placeId: z.string().trim().optional(),
  address: z.string().trim().min(5, "Pick an address from the suggestions"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  pinAdjusted: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

/**
 * How far the provider may drag the pin from the geocoded address. Wide enough
 * to move across an HDB estate to the right block, tight enough that a
 * hand-edited hidden field cannot relocate the listing.
 */
const MAX_ADJUST_M = 2000;

export type PostListingState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

type PendingImage = {
  bytes: Uint8Array;
  mimeType: AcceptedImageType;
  width: number;
  height: number;
};

/** A photo the provider sent that we are refusing, with a reason to show. */
class ImageInputError extends Error {}

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
 * Validates the uploaded photos before anything is written anywhere.
 *
 * The browser resizes and re-encodes every file, but this action is reachable
 * by direct POST, so nothing the client claims about a file is taken at face
 * value: the size is re-checked and the type comes from the magic bytes.
 */
async function readImages(formData: FormData): Promise<PendingImage[]> {
  // An empty file input still submits one zero-byte entry.
  const files = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return [];

  if (!hasImageStorage()) {
    throw new ImageInputError(
      "Photo uploads are not configured on this deployment.",
    );
  }
  if (files.length > MAX_IMAGES_PER_LISTING) {
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

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    price: formData.get("price"),
    roomType: formData.get("roomType"),
    tags: formData.getAll("tags"),
    placeId: formData.get("placeId") ?? undefined,
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    pinAdjusted: formData.get("pinAdjusted") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  // Before the Maps call, so a rejected photo does not cost a Distance Matrix
  // request.
  let pendingImages: PendingImage[];
  try {
    pendingImages = await readImages(formData);
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
    // Uploaded in parallel, but settled rather than raced: if one fails we
    // still need the paths of the ones that succeeded in order to clean up.
    const results = await Promise.allSettled(
      pendingImages.map((image) =>
        uploadListingImage(listing.id, image.bytes, image.mimeType),
      ),
    );
    const uploaded = results.map((result): StoredImage | null =>
      result.status === "fulfilled" ? result.value : null,
    );

    if (uploaded.some((file) => file === null)) {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[post] image upload failed:", result.reason);
        }
      }
      // Publishing a listing whose photos silently vanished is worse than not
      // publishing it, so undo the whole thing and let the provider retry.
      await removeListingImages(
        uploaded.filter((file) => file !== null).map((file) => file.storagePath),
      );
      await prisma.listing.delete({ where: { id: listing.id } });
      return {
        error:
          "Your photos could not be uploaded, so the listing was not published. Please try again.",
      };
    }

    await prisma.listingImage.createMany({
      data: pendingImages.map((image, index) => ({
        listingId: listing.id,
        url: uploaded[index]!.url,
        storagePath: uploaded[index]!.storagePath,
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
  redirect(`/listings/${listing.id}`);
}
