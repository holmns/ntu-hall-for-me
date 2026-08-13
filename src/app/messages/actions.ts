"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export type SendMessageState = { error?: string; ok?: boolean };

export async function sendMessage(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { error: "You need to be signed in to send a message." };
  }

  const listingId = String(formData.get("listingId") ?? "");
  const peerId = String(formData.get("peerId") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  if (!listingId || !peerId) return { error: "Missing conversation details." };
  if (!content) return { error: "Write something first." };
  if (content.length > 2000) return { error: "That message is too long." };
  if (peerId === user.id) return { error: "You cannot message yourself." };

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, providerId: true },
  });
  if (!listing) return { error: "That listing no longer exists." };

  // A thread is only ever between a seeker and that listing's provider.
  const isProvider = listing.providerId === user.id;
  if (!isProvider && peerId !== listing.providerId) {
    return { error: "You can only message the provider of this listing." };
  }
  if (isProvider) {
    const peerHasWritten = await prisma.message.count({
      where: { listingId, senderId: peerId, receiverId: user.id },
    });
    if (peerHasWritten === 0) {
      return { error: "You can only reply to someone who messaged you." };
    }
  }

  await prisma.message.create({
    data: {
      listingId,
      senderId: user.id,
      receiverId: peerId,
      content,
    },
  });

  revalidatePath(`/messages/${listingId}/${peerId}`);
  revalidatePath("/messages");
  return { ok: true };
}
