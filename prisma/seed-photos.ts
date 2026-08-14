/**
 * Puts a mock photo into the `listing-images` bucket and records the row.
 *
 * Shared by `seed.ts` and `sync-listings.ts` so demo photos only ever reach
 * storage one way, through `uploadListingImage`, exactly as a provider's own
 * upload does.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import { sniffImageType } from "../src/lib/images";
import { uploadListingImage } from "../src/lib/storage";
import { photoUrl, PHOTO_HEIGHT, PHOTO_WIDTH, type MockPhoto } from "./mock-room-photos";

/**
 * Returns false instead of throwing: a demo listing with one photo short is a
 * much better outcome than a seed that dies because the network was down.
 */
export async function attachPhoto(
  prisma: PrismaClient,
  listingId: string,
  photo: MockPhoto,
  position: number,
): Promise<boolean> {
  try {
    const response = await fetch(photoUrl(photo));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = sniffImageType(bytes);
    if (!mimeType) throw new Error("not a recognised image");

    const stored = await uploadListingImage(listingId, bytes, mimeType);
    await prisma.listingImage.create({
      data: {
        listingId,
        url: stored.url,
        storagePath: stored.storagePath,
        mimeType,
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
        alt: photo.alt,
        position,
      },
    });
    return true;
  } catch (error) {
    console.warn(`  ! photo ${photo.id} skipped:`, (error as Error).message);
    return false;
  }
}
