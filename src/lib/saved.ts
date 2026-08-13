import { prisma } from "./prisma";
import { LISTING_IMAGE_SELECT } from "./images";
import type { ListingWithProvider } from "./matching";

/**
 * Which of these listings the user has saved.
 *
 * Takes the ids the page is already rendering rather than loading the whole
 * shortlist, so a browse page costs one small indexed query no matter how many
 * rooms the user has saved over time.
 */
export async function savedIdsAmong(
  userId: string | null | undefined,
  listingIds: string[],
): Promise<Set<string>> {
  if (!userId || listingIds.length === 0) return new Set();

  const rows = await prisma.savedListing.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((row) => row.listingId));
}

export async function isSaved(
  userId: string | null | undefined,
  listingId: string,
): Promise<boolean> {
  if (!userId) return false;
  const row = await prisma.savedListing.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });
  return row != null;
}

export async function countSaved(userId: string): Promise<number> {
  return prisma.savedListing.count({ where: { userId } });
}

/**
 * The saved list, most recently saved first.
 *
 * Withdrawn rooms are kept rather than filtered out: a shortlist that quietly
 * shrinks is worse than one that says a room is no longer listed, which is
 * what the card's `unavailable` flag renders.
 */
export async function listSavedListings(userId: string): Promise<
  { listing: ListingWithProvider; savedAt: Date }[]
> {
  const rows = await prisma.savedListing.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      listing: {
        include: {
          provider: { select: { id: true, name: true, image: true } },
          images: LISTING_IMAGE_SELECT,
        },
      },
    },
  });

  return rows.map((row) => ({ listing: row.listing, savedAt: row.createdAt }));
}
