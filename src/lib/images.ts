/**
 * Rules shared by everything that touches listing photos.
 *
 * Deliberately free of Node and browser APIs so the client uploader, the
 * server action and `prisma/seed.ts` can all import it.
 */

/** Mirrors `file_size_limit` on the `listing-images` bucket. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Per listing. Enough to show a room properly, few enough to stay browsable. */
export const MAX_IMAGES_PER_LISTING = 6;

/** Longest edge kept after the browser downscales an upload. */
export const MAX_IMAGE_EDGE = 1600;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** `accept` attribute for the file picker. */
export const IMAGE_ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

export const IMAGE_EXTENSION: Record<AcceptedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Identifies an image from its magic bytes.
 *
 * The bucket's `allowed_mime_types` only checks the Content-Type the uploader
 * claims, so it is not a real check. This is: whatever the browser said the
 * file was, the first bytes have to agree.
 */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= PNG_MAGIC.length &&
    PNG_MAGIC.every((byte, i) => bytes[i] === byte)
  ) {
    return "image/png";
  }

  // "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/** What the gallery and cards need to render a photo. Never includes bytes. */
export type ListingImageView = {
  id: string;
  url: string;
  width: number;
  height: number;
  alt: string;
};

/**
 * Column set for embedding images in a listing query.
 *
 * Always select through this rather than `include: { images: true }`, so a
 * listing query stays a fixed, small payload as the model grows.
 */
export const LISTING_IMAGE_SELECT = {
  select: { id: true, url: true, width: true, height: true, alt: true },
  orderBy: { position: "asc" },
} as const;

/**
 * Alt text stored for an uploaded photo. Deliberately generic rather than
 * derived from the title, which is edited independently and would leave every
 * photo describing an older version of the listing.
 */
export function uploadedImageAlt(index: number): string {
  return `Room photo ${index + 1}`;
}
