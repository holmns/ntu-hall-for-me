import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  type AcceptedImageType,
} from "./images";

/**
 * Browser-side downscaling, run before anything is uploaded.
 *
 * A phone photo is 3-6MB and 4000px wide, which is both over the bucket's
 * limit and far more than a listing card needs. Resizing here means the
 * network only ever carries the version we actually display, and the server
 * action's body limit can stay small.
 *
 * Browser APIs only - import this from client components.
 */

/** Aim for this per photo; quality steps down until it fits. */
const TARGET_BYTES = 700 * 1024;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.45;
const QUALITY_STEP = 0.1;

/** Refuse to even decode something this big; it is not a room photo. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export type PreparedImage = {
  id: string;
  file: File;
  width: number;
  height: number;
  /** Object URL for the preview tile. Revoke it when the tile goes away. */
  previewUrl: string;
};

/** A file the user picked that we will not upload, with a reason to show. */
export class ImageRejected extends Error {}

let encoding: AcceptedImageType | null = null;

/** WebP where available (roughly 30% smaller), JPEG otherwise. */
function encodingType(): AcceptedImageType {
  if (encoding) return encoding;
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  encoding = probe.toDataURL("image/webp").startsWith("data:image/webp")
    ? "image/webp"
    : "image/jpeg";
  return encoding;
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // Honours the EXIF orientation flag, so portrait phone photos are not
    // silently rotated on their side.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function renamed(name: string, type: AcceptedImageType): string {
  const stem = name.replace(/\.[^.]+$/, "") || "photo";
  return `${stem}.${type === "image/webp" ? "webp" : "jpg"}`;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImageRejected(`${file.name} is not an image`);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageRejected(`${file.name} is too large to process`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new ImageRejected(`${file.name} could not be read as an image`);
  }

  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new ImageRejected("This browser cannot process images");
  }

  // A transparent PNG would come out with a black background once encoded as
  // JPEG, so paint the sheet white first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const type = encodingType();
  let quality = START_QUALITY;
  let blob = await toBlob(canvas, type, quality);
  while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
    quality -= QUALITY_STEP;
    blob = await toBlob(canvas, type, quality);
  }

  if (!blob) {
    throw new ImageRejected(`${file.name} could not be compressed`);
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new ImageRejected(`${file.name} is still too large after resizing`);
  }

  return {
    id: crypto.randomUUID(),
    file: new File([blob], renamed(file.name, type), { type }),
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}
