"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export type ToggleSavedResult = { saved: boolean };

/**
 * Adds or removes a room from the signed-in user's shortlist.
 *
 * Deliberately revalidates nothing. The browse page is `force-dynamic` and one
 * search costs a parse call, an embedding call and a reasons call, so a
 * revalidation here would make bookmarking a room silently re-run the whole
 * pipeline and throw away the streamed reasons already on screen. The button
 * holds its own state and `/saved` is dynamic, so both are correct without it.
 *
 * `desired` comes from the client, but the row is keyed on the session user, so
 * the worst a forged call can do is toggle the caller's own shortlist.
 */
export async function setListingSaved(
  listingId: string,
  desired: boolean,
): Promise<ToggleSavedResult> {
  const user = await requireUser();
  if (!listingId) throw new Error("Missing listing.");

  if (desired) {
    // Upsert rather than create: double-clicking the heart, or two tabs, must
    // not fail on the unique constraint.
    await prisma.savedListing.upsert({
      where: { userId_listingId: { userId: user.id, listingId } },
      create: { userId: user.id, listingId },
      update: {},
    });
  } else {
    await prisma.savedListing.deleteMany({
      where: { userId: user.id, listingId },
    });
  }

  return { saved: desired };
}
